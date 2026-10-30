# The Route 2027

A Mombasa–Kisumu journey bot and driving game for the 2027 campaign, with a role-based team dashboard.

- **Player app** (`/`): anonymous nickname sign-in after consent, 12-stage Sheng journey (based on the Manus script), 11 game legs, free drive leaderboard, daily tasks, ground reports, fact-check hub, manifesto library.
- **Team dashboard** (`/admin.html`): roles `superadmin`, `admin`, `editor`, `factdesk`, `coordinator`.

## Stack
- Supabase (Postgres + row-level security, anonymous auth, storage bucket `media`, edge function `create-team-member`)
- Cloudflare Workers static assets, deployed by GitHub Actions on every push to `main`

## Setup
1. Apply `supabase/migrations/001_init.sql`.
2. Deploy `supabase/functions/create-team-member`.
3. Enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
4. Put the project URL and publishable key in `public/config.js`.
5. Add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
6. Owner: create an account at `/admin.html` → "First-time owner setup", then promote it:
   `update public.profiles set role='superadmin' where id=(select id from auth.users where email='OWNER_EMAIL');`

## Roles
| Role | Sees |
|---|---|
| superadmin | Everything; creates admins |
| admin | Everything; adds team members; approves manifesto topics |
| editor | Overview, reports, fact-checks, storylines, tasks, manifesto drafts |
| factdesk | Reports and fact-checks |
| coordinator | Reports and volunteers in their county |

Player data is private to each player; only the roles above can read it, through the rules in the migration.
