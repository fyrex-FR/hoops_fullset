# Hoops Fullset

Web app to track the `2025-26 Topps NBA Hoops Basketball` full set and find trade matches between collectors.

## What is included

- `frontend/`: React + Vite checklist UI for Cloudflare Pages.
- `backend/`: FastAPI API for Coolify.
- `supabase/migrations/`: first database schema for sets, cards, profiles, and user collections.
- `scripts/import_checklist.py`: XLSX to CSV importer with no third-party dependency.
- `data/checklists/2025-26-topps-nba-hoops-basketball-checklist.csv`: seed checklist generated from the provided Topps file.

Current checklist count: 1041 cards.

## Supabase strategy

This app is designed to reuse an existing Supabase project instead of requiring a dedicated project. All database tables are prefixed with `hoops_` to avoid collisions with the collection/catalog apps:

- `hoops_card_sets`
- `hoops_cards`
- `hoops_profiles`
- `hoops_user_cards`

That keeps auth and quotas shared while leaving the Hoops data model isolated.

Auth uses email + password from the app, not magic links. In Supabase Auth providers, keep Email enabled and disable required email confirmation if users should create an account and start tracking cards immediately without being redirected through the shared project's Site URL.

## Local development

Backend:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Import checklist

```bash
python3 scripts/import_checklist.py \
  /path/to/2025-26-Topps-NBA-Hoops-Basketball-Checklist.xlsx \
  data/checklists/2025-26-topps-nba-hoops-basketball-checklist.csv
```

## V1 scope

The first useful version should support:

- Browse/search the full checklist.
- Supabase auth and public collector profiles.
- Mark owned quantity, tradeable quantity, wanted, and priority per card.
- Public collection pages.
- Trade matching between two collectors:
  - cards they can give me that I want;
  - cards I can give them that they want;
  - a simple compatibility score.

Messaging is intentionally out of V1. A clear match page plus contact link is enough to prove the product.
