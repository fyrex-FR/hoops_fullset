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

type ViewMode = "all" | "owned" | "wanted" | "trade";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api-fullset.cardvaults.app";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = "hoops-fullset-collection-v1";

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
  const [authMessage, setAuthMessage] = useState<string | null>(null);

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

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(cards.map((card) => card.category))).sort()],
    [cards],
  );

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      const entry = collection[card.id] ?? emptyEntry();
      const categoryMatch = category === "All" || card.category === category;
      const queryMatch =
        !needle ||
        [card.card_number, card.player_name, card.team_name, card.subset]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      const modeMatch =
        viewMode === "all" ||
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

  function updateCard(cardId: string, updater: (entry: CollectionEntry) => CollectionEntry) {
    setCollection((current) => {
      const nextEntry = updater(current[cardId] ?? emptyEntry());
      return { ...current, [cardId]: nextEntry };
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

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthMessage(authError ? authError.message : "Magic link sent");
  }

  const baseCount = totals.base;
  const autoCount = totals.autos;
  const insertCount = totals.inserts;

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">2025-26 Topps NBA Hoops Basketball</p>
          <h1>Full set tracker</h1>
        </div>
        <div className="stats" aria-label="Checklist stats">
          <span>{cards.length} cards</span>
          <span>{baseCount} base</span>
          <span>{insertCount} inserts</span>
          <span>{autoCount} autos</span>
        </div>
      </section>

      <section className="collection-bar" aria-label="Collection progress">
        <div>
          <strong>{totals.owned}</strong>
          <span>owned</span>
        </div>
        <div>
          <strong>{totals.wanted}</strong>
          <span>wanted</span>
        </div>
        <div>
          <strong>{totals.trade}</strong>
          <span>for trade</span>
        </div>
        <button className="icon-button labeled" onClick={exportCollection} type="button">
          <Download size={17} />
          Export
        </button>
      </section>

      <section className="account-strip" aria-label="Account">
        {supabase ? (
          user ? (
            <div className="account-line">
              <Check size={17} />
              <span>{user.email}</span>
              <button type="button" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <form className="account-form" onSubmit={sendMagicLink}>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email for cloud sync"
                type="email"
              />
              <button type="submit">Magic link</button>
              {authMessage ? <span>{authMessage}</span> : null}
            </form>
          )
        ) : (
          <span>Local mode. Add Supabase env vars to enable login.</span>
        )}
      </section>

      <section className="toolbar" aria-label="Filters">
        <label className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, team, subset, number"
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
        {(["all", "owned", "wanted", "trade"] as ViewMode[]).map((mode) => (
          <button
            className={viewMode === mode ? "active" : ""}
            key={mode}
            onClick={() => setViewMode(mode)}
            type="button"
          >
            {mode}
          </button>
        ))}
      </section>

      <section className="table-wrap">
        {isLoading ? (
          <p className="state">Loading checklist...</p>
        ) : error ? (
          <p className="state state-error">Could not load checklist: {error}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Player</th>
                <th>Team</th>
                <th>Subset</th>
                <th>Type</th>
                <th>Owned</th>
                <th>Trade</th>
                <th>Want</th>
                <th>Priority</th>
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
                      <div className="stepper">
                        <button
                          aria-label="Decrease owned"
                          onClick={() =>
                            updateCard(card.id, (current) => {
                              const owned_count = Math.max(0, current.owned_count - 1);
                              return {
                                ...current,
                                owned_count,
                                trade_count: Math.min(current.trade_count, owned_count),
                              };
                            })
                          }
                          type="button"
                        >
                          <Minus size={14} />
                        </button>
                        <span>{entry.owned_count}</span>
                        <button
                          aria-label="Increase owned"
                          onClick={() =>
                            updateCard(card.id, (current) => ({
                              ...current,
                              owned_count: current.owned_count + 1,
                            }))
                          }
                          type="button"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="stepper">
                        <button
                          aria-label="Decrease trade count"
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
                          aria-label="Increase trade count"
                          onClick={() =>
                            updateCard(card.id, (current) => {
                              const owned_count = Math.max(current.owned_count, current.trade_count + 1);
                              return {
                                ...current,
                                owned_count,
                                trade_count: current.trade_count + 1,
                              };
                            })
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
