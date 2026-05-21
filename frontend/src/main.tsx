import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search, SlidersHorizontal } from "lucide-react";
import "./styles.css";

type Card = {
  id: string;
  category: string;
  subset: string;
  card_number: string;
  player_name: string;
  team_name: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "https://api-fullset.cardvaults.app";

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

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

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(cards.map((card) => card.category))).sort()],
    [cards],
  );

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      const categoryMatch = category === "All" || card.category === category;
      const queryMatch =
        !needle ||
        [card.card_number, card.player_name, card.team_name, card.subset]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return categoryMatch && queryMatch;
    });
  }, [cards, category, query]);

  const baseCount = cards.filter((card) => card.category === "Base").length;
  const autoCount = cards.filter((card) => card.category === "Autographs").length;
  const insertCount = cards.filter((card) => card.category === "Inserts").length;

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
              </tr>
            </thead>
            <tbody>
              {filteredCards.map((card) => (
                <tr key={card.id}>
                  <td className="number">{card.card_number}</td>
                  <td>{card.player_name}</td>
                  <td>{card.team_name}</td>
                  <td>{card.subset}</td>
                  <td>
                    <span className="pill">{card.category}</span>
                  </td>
                </tr>
              ))}
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
