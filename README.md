# Hearty Welcome (Cloud-Only Production Baseline)

Hearty Welcome is a low-cost, scalable event invite + RSVP app built for cloud deployment with Supabase.

## What This Version Targets

- Cloud-only runtime (no local storage fallback)
- Host auth (email/password)
- Secure invite-token guest access
- RLS-protected multi-tenant data model
- Atomic writes for hot paths via SQL RPC

## Setup

1. In Supabase SQL editor, run:
   - `/Users/phanidileep/Documents/New project/db/schema.sql`
2. Edit:
   - `/Users/phanidileep/Documents/New project/supabase-config.js`
3. Set:
   - `url`: Supabase project URL
   - `anonKey`: Supabase public anon key
4. In Supabase Dashboard:
   - Authentication -> Providers -> Email enabled
   - Optional for testing: disable email confirmation
5. Open:
   - `/Users/phanidileep/Documents/New project/index.html`

## Free Cloud Deploy (Recommended for Auth Verification)

### Option A: Vercel (Free)

1. Push this folder to a GitHub repository.
2. In Vercel, import the repo and deploy.
3. Keep all files at repo root (no build step required for this static app).
4. Your app will be available at `https://<project>.vercel.app`.

### Option B: Netlify (Free)

1. Push this folder to GitHub.
2. In Netlify, import the repo.
3. Build command: none
4. Publish directory: `.`
5. Deploy and use the generated `https://<site>.netlify.app` URL.

## Supabase Auth Redirect Setup

After deployment, add these in Supabase:

1. Authentication -> URL Configuration -> Site URL
   - set to your deployed URL (for example `https://<project>.vercel.app`)
2. Authentication -> URL Configuration -> Redirect URLs
   - add deployed URL
   - add local URL if needed (for example `http://localhost:5500`)

Without these URLs, email verification links may fail.

## Production Architecture

- Frontend: static hosting (Vercel/Cloudflare Pages/Netlify)
- DB/Auth/API: Supabase Postgres + Auth + PostgREST
- Security boundary: Postgres RLS policies
- High-throughput write paths:
  - `create_event_with_primary_token(...)`
  - `submit_rsvp_with_token(...)`

## Security Model

- Host can only access own events (`host_user_id = auth.uid()`).
- Guests can only access event/RSVP data with valid invite token (`x-invite-token`).
- Invite tokens are per-event and revocable via `is_active`.

## Scaling Notes

- Indexed access paths for host events, invite token lookup, and RSVP reads.
- Unique constraints prevent duplicate RSVP identities at event scope.
- RPC calls reduce multi-roundtrip race conditions.
- This architecture scales with Supabase/Postgres vertical + read replica strategy.

## Next Hardening Steps

1. Add bot/rate-limit protection on signup and RSVP endpoints (Captcha + edge checks).
2. Move passcode checks to SQL function so client cannot bypass logic.
3. Add audit/event logs table for abuse monitoring.
4. Add soft delete + retention policies for old events.
