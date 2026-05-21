from csv import DictReader
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


ROOT = Path(__file__).resolve().parents[1]
CHECKLIST_PATH = ROOT / "data" / "checklists" / "2025-26-topps-nba-hoops-basketball-checklist.csv"


class Card(BaseModel):
    id: str
    set_slug: str
    set_name: str
    category: str
    subset: str
    card_number: str
    player_name: str
    team_name: str


def load_cards() -> list[Card]:
    with CHECKLIST_PATH.open(encoding="utf-8") as file:
        rows = list(DictReader(file))

    cards: list[Card] = []
    for row in rows:
        card_id = f"{row['set_slug']}:{row['card_number']}"
        cards.append(Card(id=card_id, **row))
    return cards


app = FastAPI(title="Hoops Fullset API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/cards", response_model=list[Card])
def cards(
    q: Annotated[str | None, Query(description="Search player, team, number, subset")] = None,
    category: str | None = None,
    subset: str | None = None,
) -> list[Card]:
    records = load_cards()
    if category:
        records = [card for card in records if card.category.lower() == category.lower()]
    if subset:
        records = [card for card in records if card.subset.lower() == subset.lower()]
    if q:
        needle = q.lower()
        records = [
            card
            for card in records
            if needle
            in " ".join([card.card_number, card.player_name, card.team_name, card.subset]).lower()
        ]
    return records


@app.get("/metadata")
def metadata() -> dict[str, object]:
    records = load_cards()
    return {
        "count": len(records),
        "categories": sorted({card.category for card in records}),
        "subsets": sorted({card.subset for card in records}),
        "teams": sorted({card.team_name for card in records}),
    }
