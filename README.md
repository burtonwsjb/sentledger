# SentLedger

Sent-message records, tracking and evidence timelines — as a web app and a developer API.

- **Server:** Bun + Hono (`server/src`) — API `/v1`, tracking (`/t`, `/f`, `/u`), provider/billing webhooks, OAuth callbacks, server-rendered marketing site, background worker.
- **Web app:** React + Vite + Tailwind (`web/`) served at `/app`.
- **Data:** Supabase Postgres (RLS on every table), Auth, private Storage. Migrations in `supabase/migrations`.
- **Deploy:** Railway, `Dockerfile` + `railway.json`.

```bash
bun install
bun run build      # web app -> dist/web
bun run dev        # server on :8080 (needs env, see docs/SETUP.md)
bun run dev:web    # Vite dev server on :5173, proxies /v1 to :8080
bun test           # unit tests
bun run typecheck
```

See `docs/SETUP.md` for production configuration and `docs/EXTENSIONS.md` for the extension contract.
