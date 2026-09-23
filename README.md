# Appointly

Online booking and scheduling for service businesses. A business gets a public booking page, a
shared calendar, services, staff, and a customer list; Appointly staff verify GoTyme Bank
subscription payments by hand from a separate admin area.

**Stack:** React 19 + TypeScript + Vite, Tailwind CSS v4, React Router, Supabase
(Postgres + Auth + Storage). There is no application server: the browser talks to Supabase
directly, and every rule that matters is enforced by Row Level Security and security-definer
functions in `supabase/migrations/`.

## Running locally

```bash
npm install
cp .env.example .env     # fill in from Supabase -> Project Settings -> API
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | `tsc -b` then a production build into `dist/` |
| `npm run lint` | ESLint over `src/` |
| `npm run preview` | Serve the production build locally |

## Environment variables

Only two, both read by the browser, both safe to expose — access is decided by RLS, not by
holding the key:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The project's publishable / anon key |

**The service-role key is never used by this app.** It exists only inside Supabase Edge
Functions, where the runtime provides it; it must never be given a `VITE_` prefix, put in `.env`,
or referenced from `src/`.

The legacy Xendit Edge Functions (`supabase/functions/xendit-*`) carry their own server-side
secrets — see `supabase/functions/.env.example`. They are not used by the GoTyme flow.

## Database

Migrations are plain SQL, applied in order:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

`supabase/reset-data.sql` empties tenant data while keeping the schema, plans, payment settings
and platform admins. **Never run it against a database with real customers.**

### First admin account

`0023_admin_username_login.sql` seeds the first platform-admin account, because the first one
cannot be granted by an existing admin. Its `v_password` is a placeholder and the migration
refuses to create the account while it is still set: put a real password in, run the migration,
then restore the placeholder before committing. Change the password again from Supabase Auth
once you have signed in.

## Supabase configuration (dashboard, not in this repo)

- **Auth -> URL Configuration -> Site URL** — the production origin, e.g. `https://appointly.ph`.
- **Auth -> URL Configuration -> Redirect URLs** — every origin the app is served from, each with
  `/login` and `/reset-password`, plus `http://localhost:5173/*` for development. Sign-up and
  password-reset links are built from `window.location.origin`, so an origin that is not listed
  falls back to the Site URL.
- **Auth -> Email Templates -> Confirm signup** — paste `supabase/templates/confirm-signup.html`.
- **Auth -> SMTP** — Supabase's built-in sender is rate-limited and not for production; connect a
  real SMTP provider before launch.
- **Storage** — `payment-proofs` is private and read through short-lived signed URLs;
  `service-images` and `payment-assets` are public. Migration `0025` asserts all three.

## Deploying

The app is a static SPA. `vercel.json` sets the build command, the output directory, the
history-API rewrite (so `/book/<slug>` resolves on a hard refresh) and the response headers.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment settings; they are
read at build time, so changing one needs a redeploy.
