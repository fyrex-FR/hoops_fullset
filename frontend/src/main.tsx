import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  Check,
  Download,
  Heart,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  UserPlus,
  User as UserIcon,
} from "lucide-react";
import "./styles.css";

type Card = {
  id: string;
  category: string;
  subset: string;
  card_number: string;
  player_name: string;
  team_name: string;
};

type CollectionEntry = {
  owned_count: number;
  trade_count: number;
  wanted: boolean;
  priority: number;
};

type UserProfile = {
  id: string;
  display_name: string;
  discord_handle: string | null;
};

type DbCard = {
  id: string;
  card_number: string;
  subset: string;
};

type UserCardRow = CollectionEntry & {
  card_id: string;
  hoops_cards: DbCard | DbCard[] | null;
};

type ViewMode = "all" | "missing" | "owned" | "wanted" | "trade";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api-fullset.cardvaults.app";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = "hoops-fullset-collection-v1";
const CLOUD_MIGRATION_KEY = "hoops-fullset-cloud-migrated-v1";

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function emptyEntry(): CollectionEntry {
  return { owned_count: 0, trade_count: 0, wanted: false, priority: 0 };
}

function readStoredCollection(): Record<string, CollectionEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isActiveEntry(entry: CollectionEntry) {
  return entry.owned_count > 0 || entry.trade_count > 0 || entry.wanted || entry.priority > 0;
}

function cardLookupKey(cardNumber: string, subset: string) {
  return `${cardNumber}|||${subset}`;
}

function normalizeCardNumber(value: string) {
  return value.trim().replace(/^#\s*/i, "").replace(/^no\.?\s*/i, "").toLowerCase();
}

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [collection, setCollection] = useState<Record<string, CollectionEntry>>(() =>
    readStoredCollection(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupDiscord, setSignupDiscord] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [discordHandle, setDiscordHandle] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [dbCardIds, setDbCardIds] = useState<Record<string, string>>({});
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSubsetProgressOpen, setIsSubsetProgressOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/cards`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        return response.json();
      })
      .then((records: Card[]) => {
        setCards(records);
        setError(null);
      })
      .catch((requestError: Error) => {
        setCards([]);
        setError(requestError.message);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  }, [collection]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setProfile(null);
      setProfileName("");
      setDiscordHandle("");
      setProfileMessage(null);
      return;
    }

    supabase
      .from("hoops_profiles")
      .select("id, display_name, discord_handle")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (profileError) {
          setProfileMessage(profileError.message);
          return;
        }

        const fallbackName = user.email?.split("@")[0] ?? "";
        setProfile(data);
        setProfileName(data?.display_name ?? fallbackName);
        setDiscordHandle(data?.discord_handle ?? "");
      });
  }, [user]);

  useEffect(() => {
    if (!supabase || !user || cards.length === 0) return;

    const client = supabase;
    const currentUser = user;
    let cancelled = false;

    async function loadCloudCollection() {
      setSyncMessage("Synchronisation...");
      const cardByKey = new Map(cards.map((card) => [cardLookupKey(card.card_number, card.subset), card]));
      const fallbackName = currentUser.email?.split("@")[0] ?? "Collector";

      const { error: profileEnsureError } = await client
        .from("hoops_profiles")
        .upsert(
          { id: currentUser.id, display_name: fallbackName },
          { onConflict: "id", ignoreDuplicates: true },
        );

      if (cancelled) return;
      if (profileEnsureError) {
        setSyncMessage(`Erreur profil: ${profileEnsureError.message}`);
        return;
      }

      const { data: dbCards, error: cardError } = await client
        .from("hoops_cards")
        .select("id, card_number, subset");

      if (cancelled) return;
      if (cardError) {
        setSyncMessage(`Erreur cartes: ${cardError.message}`);
        return;
      }

      const nextDbCardIds: Record<string, string> = {};
      for (const dbCard of (dbCards ?? []) as DbCard[]) {
        const clientCard = cardByKey.get(cardLookupKey(dbCard.card_number, dbCard.subset));
        if (clientCard) nextDbCardIds[clientCard.id] = dbCard.id;
      }
      setDbCardIds(nextDbCardIds);

      const { data: rows, error: collectionError } = await client
        .from("hoops_user_cards")
        .select("card_id, owned_count, trade_count, wanted, priority, hoops_cards(id, card_number, subset)")
        .eq("user_id", currentUser.id);

      if (cancelled) return;
      if (collectionError) {
        setSyncMessage(`Erreur collection: ${collectionError.message}`);
        return;
      }

      const cloudCollection: Record<string, CollectionEntry> = {};
      for (const row of (rows ?? []) as UserCardRow[]) {
        const dbCard = Array.isArray(row.hoops_cards) ? row.hoops_cards[0] : row.hoops_cards;
        if (!dbCard) continue;
        const clientCard = cardByKey.get(cardLookupKey(dbCard.card_number, dbCard.subset));
        if (!clientCard) continue;
        cloudCollection[clientCard.id] = {
          owned_count: row.owned_count,
          trade_count: row.trade_count,
          wanted: row.wanted,
          priority: row.priority,
        };
      }

      const migrationKey = `${CLOUD_MIGRATION_KEY}:${currentUser.id}`;
      const localCollection = readStoredCollection();
      const localRows = Object.entries(localCollection).filter(([, entry]) => isActiveEntry(entry));

      if (!localStorage.getItem(migrationKey) && localRows.length > 0) {
        const payload: Array<CollectionEntry & { user_id: string; card_id: string }> = [];
        for (const [cardId, entry] of localRows) {
          const dbCardId = nextDbCardIds[cardId];
          if (!dbCardId) continue;
          payload.push({
            user_id: currentUser.id,
            card_id: dbCardId,
            owned_count: entry.owned_count,
            trade_count: entry.trade_count,
            wanted: entry.wanted,
            priority: entry.priority,
          });
        }

        if (payload.length > 0) {
          const { error: migrationError } = await client.from("hoops_user_cards").upsert(payload);
          if (cancelled) return;
          if (migrationError) {
            setSyncMessage(`Erreur migration locale: ${migrationError.message}`);
            return;
          }
        }

        localStorage.setItem(migrationKey, "1");
        setCollection({ ...cloudCollection, ...localCollection });
        setSyncMessage("Collection locale migree dans le cloud.");
        return;
      }

      setCollection(cloudCollection);
      setSyncMessage("Sync cloud active.");
    }

    void loadCloudCollection();

    return () => {
      cancelled = true;
    };
  }, [cards, user]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(cards.map((card) => card.category))).sort()],
    [cards],
  );

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const numberNeedle = normalizeCardNumber(query);
    return cards.filter((card) => {
      const entry = collection[card.id] ?? emptyEntry();
      const categoryMatch = category === "All" || card.category === category;
      const numberMatch = Boolean(numberNeedle) && normalizeCardNumber(card.card_number) === numberNeedle;
      const queryMatch =
        !needle ||
        numberMatch ||
        [card.card_number, card.player_name, card.team_name, card.subset]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      const modeMatch =
        viewMode === "all" ||
        (viewMode === "missing" && entry.owned_count === 0) ||
        (viewMode === "owned" && entry.owned_count > 0) ||
        (viewMode === "wanted" && entry.wanted) ||
        (viewMode === "trade" && entry.trade_count > 0);
      return categoryMatch && queryMatch && modeMatch;
    });
  }, [cards, category, collection, query, viewMode]);

  const totals = useMemo(() => {
    return cards.reduce(
      (acc, card) => {
        const entry = collection[card.id] ?? emptyEntry();
        if (entry.owned_count > 0) acc.owned += 1;
        if (entry.trade_count > 0) acc.trade += 1;
        if (entry.wanted) acc.wanted += 1;
        if (card.category === "Base") acc.base += 1;
        if (card.category === "Autographs") acc.autos += 1;
        if (card.category === "Inserts") acc.inserts += 1;
        return acc;
      },
      { autos: 0, base: 0, inserts: 0, owned: 0, trade: 0, wanted: 0 },
    );
  }, [cards, collection]);

  const categoryProgress = useMemo(() => {
    const labels: Record<string, string> = {
      Autographs: "Autos",
      Base: "Base",
      Inserts: "Inserts",
    };
    const order = ["Base", "Inserts", "Autographs"];
    const progress = new Map<string, { label: string; owned: number; total: number }>();
    for (const card of cards) {
      const current = progress.get(card.category) ?? {
        label: labels[card.category] ?? card.category,
        owned: 0,
        total: 0,
      };
      current.total += 1;
      if ((collection[card.id] ?? emptyEntry()).owned_count > 0) current.owned += 1;
      progress.set(card.category, current);
    }

    return Array.from(progress.entries())
      .map(([categoryName, value]) => ({
        categoryName,
        ...value,
        percent: value.total > 0 ? Math.round((value.owned / value.total) * 100) : 0,
      }))
      .sort((a, b) => {
        const aIndex = order.indexOf(a.categoryName);
        const bIndex = order.indexOf(b.categoryName);
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      });
  }, [cards, collection]);

  async function persistCollectionEntry(cardId: string, entry: CollectionEntry) {
    if (!supabase || !user) return;
    const dbCardId = dbCardIds[cardId];
    if (!dbCardId) {
      setSyncMessage("Cette carte n'est pas encore liee a Supabase.");
      return;
    }

    if (!isActiveEntry(entry)) {
      const { error: deleteError } = await supabase
        .from("hoops_user_cards")
        .delete()
        .eq("user_id", user.id)
        .eq("card_id", dbCardId);
      setSyncMessage(deleteError ? `Erreur suppression cloud: ${deleteError.message}` : "Sauvegarde cloud OK.");
      return;
    }

    const { error: saveError } = await supabase.from("hoops_user_cards").upsert({
      user_id: user.id,
      card_id: dbCardId,
      owned_count: entry.owned_count,
      trade_count: entry.trade_count,
      wanted: entry.wanted,
      priority: entry.priority,
    });
    setSyncMessage(saveError ? `Erreur sauvegarde cloud: ${saveError.message}` : "Sauvegarde cloud OK.");
  }

  function updateCard(cardId: string, updater: (entry: CollectionEntry) => CollectionEntry) {
    const nextEntry = updater(collection[cardId] ?? emptyEntry());
    setCollection((current) => ({ ...current, [cardId]: nextEntry }));
    void persistCollectionEntry(cardId, nextEntry);
  }

  function toggleOwned(cardId: string) {
    updateCard(cardId, (current) => {
      const owned = current.owned_count > 0;
      return {
        ...current,
        owned_count: owned ? 0 : 1,
        trade_count: owned ? 0 : current.trade_count,
      };
    });
  }

  function exportCollection() {
    const rows = cards
      .map((card) => ({ card, entry: collection[card.id] ?? emptyEntry() }))
      .filter(({ entry }) => entry.owned_count || entry.trade_count || entry.wanted)
      .map(({ card, entry }) =>
        [
          card.card_number,
          card.player_name,
          card.team_name,
          card.subset,
          entry.owned_count,
          entry.trade_count,
          entry.wanted ? "yes" : "no",
          entry.priority,
        ].join(","),
      );

    const csv = [
      "card_number,player_name,team_name,subset,owned_count,trade_count,wanted,priority",
      ...rows,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hoops-fullset-collection.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function upsertProfile(displayName: string, discord: string) {
    if (!supabase) return;

    const { data } = await supabase.auth.getUser();
    const currentUser = data.user;
    if (!currentUser) return;

    const cleanDisplayName = displayName.trim() || currentUser.email?.split("@")[0] || "Collector";
    const cleanDiscord = discord.trim();
    const { data: profileData, error: profileError } = await supabase
      .from("hoops_profiles")
      .upsert({
        id: currentUser.id,
        display_name: cleanDisplayName,
        discord_handle: cleanDiscord || null,
      })
      .select("id, display_name, discord_handle")
      .single();

    if (profileError) {
      setAuthMessage(`Compte OK, profil KO: ${profileError.message}`);
      return;
    }

    setProfile(profileData);
    setProfileName(profileData.display_name);
    setDiscordHandle(profileData.discord_handle ?? "");
  }

  async function authenticate(mode: "login" | "signup") {
    if (!supabase || isAuthenticating) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthMessage("Entre ton email.");
      return;
    }

    if (password.length < 6) {
      setAuthMessage("Mot de passe: minimum 6 caracteres.");
      return;
    }

    if (mode === "signup" && !signupName.trim()) {
      setAuthMessage("Choisis un pseudo public.");
      return;
    }

    setIsAuthenticating(true);
    setAuthMessage(mode === "signup" ? "Creation du compte..." : "Connexion...");

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email: normalizedEmail,
            password,
          })
        : await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

    if (result.error) {
      setIsAuthenticating(false);
      setAuthMessage(`Erreur auth: ${result.error.message}`);
      return;
    }

    if (mode === "signup" && result.data.session) {
      await upsertProfile(signupName, signupDiscord);
    }

    setIsAuthenticating(false);
    if (mode === "signup" && !result.data.session) {
      setAuthMessage(
        "Compte cree, mais Supabase demande encore une confirmation email. Desactive Confirm email pour avoir une inscription directe.",
      );
      return;
    }

    setAuthMessage(
      mode === "signup"
        ? "Compte cree. Tu peux remplir ta checklist."
        : "Connecte. Sync cloud active.",
    );
  }

  function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    void authenticate("login");
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !user) return;

    const displayName = profileName.trim();
    const discord = discordHandle.trim();
    if (!displayName) {
      setProfileMessage("Choisis un pseudo public.");
      return;
    }

    setIsSavingProfile(true);
    setProfileMessage(null);
    const { data, error: saveError } = await supabase
      .from("hoops_profiles")
      .upsert({
        id: user.id,
        display_name: displayName,
        discord_handle: discord || null,
      })
      .select("id, display_name, discord_handle")
      .single();

    setIsSavingProfile(false);
    if (saveError) {
      setProfileMessage(saveError.message);
      return;
    }

    setProfile(data);
    setProfileMessage("Profil sauvegarde.");
  }

  const baseCount = totals.base;
  const autoCount = totals.autos;
  const insertCount = totals.inserts;

  return (
    <main className="shell">
      <section className="topbar">
        <button className="brand" type="button" aria-label="Hoops Full Set">
          <span className="brand-mark">H</span>
          <span>
            <strong>Hoops<span>Fullset</span></strong>
            <small>2025-26 Topps NBA Hoops Basketball</small>
          </span>
        </button>
        <div className="headline">
          <p className="eyebrow">Checklist</p>
          <h1>Suivi full set</h1>
        </div>
        <div className="topbar-actions">
          <div className="stats" aria-label="Checklist stats">
            <span>{cards.length} cartes</span>
            <span>{baseCount} base</span>
            <span>{insertCount} inserts</span>
            <span>{autoCount} autos</span>
          </div>
          <section className="account-menu" aria-label="Account">
            <button
              className="account-title"
              type="button"
              onClick={() => setIsAccountOpen((current) => !current)}
              aria-expanded={isAccountOpen}
            >
              <UserIcon size={17} />
              <span>{user ? profile?.display_name || user.email : "Compte"}</span>
            </button>
            {supabase ? (
              user ? (
                <div className={`account-panel ${isAccountOpen ? "open" : ""}`}>
                  <div className="account-line">
                    <UserIcon size={17} />
                    <span>
                      {profile?.display_name || user.email}
                      {profile?.discord_handle ? <small>Discord: {profile.discord_handle}</small> : null}
                      {syncMessage ? <small>{syncMessage}</small> : null}
                    </span>
                    <button type="button" onClick={() => supabase.auth.signOut()}>
                      Sign out
                    </button>
                  </div>
                  <form className="profile-form" onSubmit={saveProfile}>
                    <input
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      placeholder="Public username"
                      type="text"
                    />
                    <input
                      value={discordHandle}
                      onChange={(event) => setDiscordHandle(event.target.value)}
                      placeholder="Discord username"
                      type="text"
                    />
                    <button disabled={isSavingProfile} type="submit">
                      {isSavingProfile ? "Saving..." : "Save profile"}
                    </button>
                    {profileMessage ? <span>{profileMessage}</span> : null}
                  </form>
                </div>
              ) : (
                <form className={`account-form ${isAccountOpen ? "open" : ""}`} onSubmit={submitLogin}>
                  <div className="account-form-header">
                    <UserPlus className="account-form-icon" size={18} aria-hidden="true" />
                    <span>
                      <strong>Compte collectionneur</strong>
                      <small>Email, mot de passe et Discord pour les echanges.</small>
                    </span>
                  </div>
                  <div className="account-fields">
                    <label>
                      <small>Email</small>
                      <input
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="collector@email.com"
                        required
                        type="email"
                      />
                    </label>
                    <label>
                      <small>Mot de passe</small>
                      <input
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Minimum 6 caracteres"
                        required
                        type="password"
                      />
                    </label>
                    <label>
                      <small>Pseudo public</small>
                      <input
                        autoComplete="nickname"
                        value={signupName}
                        onChange={(event) => setSignupName(event.target.value)}
                        placeholder="Ex: Fyrex"
                        type="text"
                      />
                    </label>
                    <label>
                      <small>Discord</small>
                      <input
                        value={signupDiscord}
                        onChange={(event) => setSignupDiscord(event.target.value)}
                        placeholder="pseudo Discord"
                        type="text"
                      />
                    </label>
                  </div>
                  <div className="account-actions">
                    <button disabled={isAuthenticating} type="submit">
                      {isAuthenticating ? "..." : "Se connecter"}
                    </button>
                    <button
                      disabled={isAuthenticating}
                      onClick={() => void authenticate("signup")}
                      type="button"
                    >
                      Creer le compte
                    </button>
                  </div>
                  {authMessage ? <span className="account-message">{authMessage}</span> : null}
                </form>
              )
            ) : (
              <span className="account-local">Local</span>
            )}
          </section>
        </div>
      </section>

      <section className="collection-bar" aria-label="Collection progress">
        <div>
          <strong>{totals.owned}</strong>
          <span>Je l'ai</span>
        </div>
        <div>
          <strong>{totals.wanted}</strong>
          <span>Recherche</span>
        </div>
        <div>
          <strong>{totals.trade}</strong>
          <span>A l'echange</span>
        </div>
        <button className="icon-button labeled" onClick={exportCollection} type="button">
          <Download size={17} />
          Export
        </button>
      </section>

      <section className="progress-section" aria-label="Progression">
        <button
          className="progress-toggle"
          type="button"
          onClick={() => setIsSubsetProgressOpen((current) => !current)}
          aria-expanded={isSubsetProgressOpen}
        >
          <span>Progression</span>
          <strong>{isSubsetProgressOpen ? "Masquer" : "Afficher"}</strong>
        </button>
        <div className={`category-progress ${isSubsetProgressOpen ? "open" : ""}`}>
          {categoryProgress.map((item) => (
            <div className="category-progress-item" key={item.categoryName}>
              <div>
                <strong>{item.label}</strong>
                <span>
                  {item.owned}/{item.total} - {item.percent}%
                </span>
              </div>
              <meter min="0" max={item.total} value={item.owned} aria-label={`${item.label} progress`} />
            </div>
          ))}
        </div>
      </section>

      <section className="toolbar" aria-label="Filters">
        <label className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher joueur, equipe, subset, #145"
          />
        </label>
        <div className="filters">
          <SlidersHorizontal size={18} />
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="view-tabs" aria-label="Collection views">
        {(["all", "missing", "owned", "wanted", "trade"] as ViewMode[]).map((mode) => (
          <button
            className={viewMode === mode ? "active" : ""}
            key={mode}
            onClick={() => setViewMode(mode)}
            type="button"
          >
            {mode === "all"
              ? "Toutes"
              : mode === "missing"
                ? "A completer"
              : mode === "owned"
                ? "Je l'ai"
                : mode === "wanted"
                  ? "Recherche"
                  : "A l'echange"}
          </button>
        ))}
      </section>

      <section className="table-wrap">
        {isLoading ? (
          <p className="state">Chargement de la checklist...</p>
        ) : error ? (
          <p className="state state-error">Impossible de charger la checklist: {error}</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Joueur</th>
                  <th>Equipe</th>
                  <th>Subset</th>
                  <th>Type</th>
                  <th>Je l'ai</th>
                  <th>Echange</th>
                  <th>Recherche</th>
                  <th>Priorite</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => {
                  const entry = collection[card.id] ?? emptyEntry();
                  return (
                    <tr key={card.id}>
                      <td className="number">{card.card_number}</td>
                      <td>{card.player_name}</td>
                      <td>{card.team_name}</td>
                      <td>{card.subset}</td>
                      <td>
                        <span className="pill">{card.category}</span>
                      </td>
                      <td>
                        <button
                          className={`check-button ${entry.owned_count > 0 ? "selected" : ""}`}
                          aria-pressed={entry.owned_count > 0}
                          aria-label={entry.owned_count > 0 ? "Marquer comme non possedee" : "Marquer comme possedee"}
                          onClick={() => toggleOwned(card.id)}
                          type="button"
                        >
                          <Check size={16} />
                        </button>
                      </td>
                      <td>
                        <div className={`stepper ${entry.owned_count === 0 ? "inactive" : ""}`}>
                          <button
                            aria-label="Reduire le nombre a l'echange"
                            disabled={entry.trade_count === 0}
                            onClick={() =>
                              updateCard(card.id, (current) => ({
                                ...current,
                                trade_count: Math.max(0, current.trade_count - 1),
                              }))
                            }
                            type="button"
                          >
                            <Minus size={14} />
                          </button>
                          <span>{entry.trade_count}</span>
                          <button
                            aria-label="Augmenter le nombre a l'echange"
                            onClick={() =>
                              updateCard(card.id, (current) => ({
                                ...current,
                                owned_count: Math.max(current.owned_count, 1),
                                trade_count: current.trade_count + 1,
                              }))
                            }
                            type="button"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          className={`icon-button ${entry.wanted ? "selected" : ""}`}
                          onClick={() =>
                            updateCard(card.id, (current) => ({ ...current, wanted: !current.wanted }))
                          }
                          type="button"
                        >
                          <Heart size={16} />
                        </button>
                      </td>
                      <td>
                        <button
                          className={`priority priority-${entry.priority}`}
                          onClick={() =>
                            updateCard(card.id, (current) => ({
                              ...current,
                              priority: current.priority === 3 ? 0 : clamp(current.priority + 1, 0, 3),
                              wanted: current.priority === 0 ? true : current.wanted,
                            }))
                          }
                          type="button"
                        >
                          <Star size={15} />
                          {entry.priority}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mobile-card-list" aria-label="Cards">
              {filteredCards.map((card) => {
                const entry = collection[card.id] ?? emptyEntry();
                return (
                  <article className="mobile-card" key={card.id}>
                    <div className="mobile-card-main">
                      <span className="number">{card.card_number}</span>
                      <div>
                        <strong>{card.player_name}</strong>
                        <small>
                          {card.team_name} - {card.subset}
                        </small>
                      </div>
                      <span className="pill">{card.category}</span>
                      <button
                        className={`check-button quick-owned ${entry.owned_count > 0 ? "selected" : ""}`}
                        aria-pressed={entry.owned_count > 0}
                        aria-label={entry.owned_count > 0 ? "Marquer comme non possedee" : "Marquer comme possedee"}
                        onClick={() => toggleOwned(card.id)}
                        type="button"
                      >
                        <Check size={16} />
                        {entry.owned_count > 0 ? "Oui" : "Je l'ai"}
                      </button>
                    </div>

                    <div className="mobile-actions">
                      <label>
                        <small>A l'echange</small>
                        <div className={`stepper ${entry.owned_count === 0 ? "inactive" : ""}`}>
                          <button
                            aria-label="Reduire le nombre a l'echange"
                            disabled={entry.trade_count === 0}
                            onClick={() =>
                              updateCard(card.id, (current) => ({
                                ...current,
                                trade_count: Math.max(0, current.trade_count - 1),
                              }))
                            }
                            type="button"
                          >
                            <Minus size={14} />
                          </button>
                          <span>{entry.trade_count}</span>
                          <button
                            aria-label="Augmenter le nombre a l'echange"
                            onClick={() =>
                              updateCard(card.id, (current) => ({
                                ...current,
                                owned_count: Math.max(current.owned_count, 1),
                                trade_count: current.trade_count + 1,
                              }))
                            }
                            type="button"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </label>

                      <button
                        className={`icon-button ${entry.wanted ? "selected" : ""}`}
                        onClick={() =>
                          updateCard(card.id, (current) => ({ ...current, wanted: !current.wanted }))
                        }
                        type="button"
                      >
                        <Heart size={16} />
                        Recherche
                      </button>

                      <button
                        className={`priority priority-${entry.priority}`}
                        onClick={() =>
                          updateCard(card.id, (current) => ({
                            ...current,
                            priority: current.priority === 3 ? 0 : clamp(current.priority + 1, 0, 3),
                            wanted: current.priority === 0 ? true : current.wanted,
                          }))
                        }
                        type="button"
                      >
                        <Star size={15} />
                        Prio {entry.priority}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
