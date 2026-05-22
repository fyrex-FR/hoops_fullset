# CODEX_CONTEXT.md - handoff for Codex

This is the handoff context for the Hoops Fullset app.

## Repo and deployment

- Local repo: `/home/fxa/.openclaw/workspace/projects/hoops_fullset`
- GitHub remote: `git@github.com:fyrex-FR/hoops_fullset.git`
- App goal: track the `2025-26 Topps NBA Hoops Basketball` full set and help collectors find trade matches.
- Frontend: intended for Cloudflare Pages.
- Backend: intended for Coolify.
- Production API URL used by frontend fallback: `https://api-fullset.cardvaults.app`
- Backend health route: `GET /health`
- Backend cards route: `GET /cards`
- Backend metadata route: `GET /metadata`

Current local git state was clean when this file was created:

```text
## main...origin/main
```

Do not deploy, push, change secrets, or run Supabase migrations without Xavier confirming.

## Stack

- Frontend: React 19 + Vite + TypeScript in `frontend/`
- Backend: FastAPI/Python in `backend/`
- Database/auth: existing Supabase project reused with `hoops_` table prefixes.
- Checklist source: `data/checklists/2025-26-topps-nba-hoops-basketball-checklist.csv`
- Current checklist count documented in README: `1041 cards`
- XLSX importer: `scripts/import_checklist.py`

Useful commands:

```bash
cd /home/fxa/.openclaw/workspace/projects/hoops_fullset/frontend
npm install
npm run build
npm run dev

cd /home/fxa/.openclaw/workspace/projects/hoops_fullset/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Important files

- `README.md`: baseline architecture and V1 scope.
- `frontend/src/main.tsx`: entire current frontend app.
- `frontend/src/styles.css`: main UI styling.
- `frontend/package.json`: frontend scripts/deps.
- `backend/app/main.py`: FastAPI checklist API.
- `backend/Dockerfile`: Coolify backend image.
- `supabase/migrations/001_initial_schema.sql`: initial Hoops schema.
- `supabase/migrations/002_profile_discord_handle.sql`: Discord handle addition.
- `.env.example`: expected env vars.

## Current product behavior

The app currently:

- Loads cards from the backend CSV API.
- Stores collection locally in `localStorage` under `hoops-fullset-collection-v1`.
- Uses Supabase when env vars exist:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Creates/logs in users with email + password directly in the app, not magic links.
- Captures public username and Discord handle for trades.
- Syncs local collection to Supabase after login once per user via `hoops-fullset-cloud-migrated-v1:<user_id>`.
- Supports filters:
  - all
  - missing
  - owned / `Je l'ai`
  - wanted / `Recherche`
  - trade / `A l'echange`
- Tracks per card:
  - `owned_count`
  - `trade_count`
  - `wanted`
  - `priority` from 0 to 3
- Exports marked cards to `hoops-fullset-collection.csv`.

## Supabase model

Tables are prefixed to avoid collisions with the other collection apps:

- `hoops_card_sets`
- `hoops_cards`
- `hoops_profiles`
- `hoops_user_cards`

Important rule:

- `hoops_user_cards` has `check (trade_count <= owned_count)`.
- Current UI treats `owned_count > 0` as "I have it".
- Increasing trade count also forces `owned_count` to at least `1`.

RLS:

- profiles are publicly readable
- users can manage their own profile
- collections are publicly readable
- users can manage their own collection

## Recent Xavier feedback / current task context

Xavier is testing on mobile and wants the app to be practical, not just technically present.

Feedback from 2026-05-21:

- Supabase email links can redirect to the wrong app because the shared Supabase Site URL is configured elsewhere. So this Hoops app should keep direct email/password account creation instead of relying on magic links/reset links for onboarding.
- He wants account creation with:
  - email
  - password
  - Discord login/handle
- Login/account block looked ugly because it was sitting awkwardly in the middle of the page.
- The desktop-style table is not practical on phone for adding cards and managing the checklist.
- The difference between owned and trade was confusing. Xavier's mental model:
  - `Je l'ai`: simple checkbox/flag that means the user has the card.
  - `A l'echange`: numeric count only when the user has copies available for trade.
  - Avoid wording that makes `owned` and `trade` feel like competing statuses.
- Xavier said "1,2,4 deja" in response to suggested additions, but the exact numbered list is not preserved here. Confirm before implementing broad feature ideas.

## Implementation notes for next Codex

The frontend is currently one large `main.tsx`. For quick fixes, editing in place is fine. For larger changes, split into components only if it reduces friction.

Most useful next improvements:

1. Make mobile the primary checklist experience.
   - Keep the table for desktop if useful.
   - On mobile, use compact rows/cards with fixed tap targets.
   - Make `Je l'ai` a clear checkbox-style action.
   - Make trade count a small stepper/input labeled `A l'echange`.
2. Clean up the account/login area.
   - Keep it near the top but not visually dumped in the vertical center.
   - Make sign up vs login clearer.
   - Use French labels consistently.
3. Tighten owned/trade wording.
   - Use `Je l'ai` for possession.
   - Use `A l'echange` for trade quantity.
   - Consider hiding/disabling trade controls until owned is checked, or auto-check owned when trade count increases.
4. Check Supabase signup behavior.
   - If `signUp` returns no session, Supabase still requires email confirmation.
   - The UI already warns that direct signup requires disabling email confirmation in Supabase.

## What not to confuse this with

This is not `projects/hobby-management`.

The wrong repo is the CardVaults collection/catalog app. The Hoops app is `projects/hoops_fullset` and the app title in the UI is `HoopsFullset`.
