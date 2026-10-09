# ZNAB Setup Guide

## Prerequisites

- **Bun** ≥ 1.1: [bun.sh](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- **Docker**, for running PostgreSQL locally
- YNAB 4 exports (`Budget.yfull`, `Budget-Fiona.yfull`, `Demo.yfull`) in
  `./seed-data/`. The folder is gitignored, so copy them in yourself.

---

## 1. Install dependencies

```bash
bun install
```

## 2. Start PostgreSQL

```bash
docker compose up -d
```

PostgreSQL will be available at `postgres://znab:znab@localhost:5432/znab`.

## 3. Configure environment

```bash
cp .env.example apps/api/.env
cp .env.example packages/db/.env
```

## 4. Run database migrations

```bash
bun db:migrate
```

Migrations are committed in `packages/db/migrations`. Run `bun db:generate`
only after changing the schema in `packages/db/src/schema/`.

## 5. Import seed data

```bash
bun import
```

This seeds the two users (`zach` and `demo`), imports `Budget.yfull` and
`Budget-Fiona.yfull` under the `zach` user, and creates a Demo budget under
the `demo` user. The script is fully idempotent, so it is safe to run again.

Expected output:
```
╔══════════════════════════════════════╗
║   ZNAB — YNAB 4 Import Script        ║
╚══════════════════════════════════════╝

Step 1: Seeding users...
  ✓ Users ready (zach: id=1, demo: id=2)

Step 2: Importing Budget.yfull (Zach)...
  ...
  ✓ Zach's budget imported

Step 3: Importing Budget-Fiona.yfull (Fiona)...
  ...
  ✓ Fiona's budget imported

Step 4: Importing Demo budget...
  ...
  ✓ Demo budget imported
```

### Keeping it current from Dropbox

While YNAB 4 is still in daily use, `scripts/sync-ynab4.sh` pulls both
`.ynab4` packages from Dropbox every 15 minutes and re-imports on change.
YNAB 4 wins: each import mirrors those budgets, wiping every edit made to
them in znab (rows created there included). Only znab-only settings (goals,
Master Budgets, the household split) are kept.

```bash
sudo apt install rclone
rclone authorize dropbox            # on a machine with a browser; copy the token
rclone config                       # on this host: new remote "dropbox", paste the token
cp scripts/ynab4-sync.service scripts/ynab4-sync.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ynab4-sync.timer
sudo loginctl enable-linger zach    # keep running while logged out
```

The packages are expected at `dropbox:YNAB/`; override with `YNAB4_REMOTE` in
`~/.config/znab/ynab4-sync.env`. `bun run ynab:reset` syncs and re-imports now,
even when nothing changed, which wipes znab edits immediately. To stop syncing
once znab takes over: `systemctl --user disable --now ynab4-sync.timer`.

## 6. Run the dev servers

In one terminal:
```bash
bun dev:api    # http://localhost:3001
```

In another:
```bash
bun dev:web    # http://localhost:5173
```

Or both at once (output interleaved):
```bash
bun dev
```

Open http://localhost:5173 to see the user picker.

## 7. Tests and checks

```bash
bun run test    # bun test in apps/api and apps/web
bun run check   # typecheck + Biome lint + tests; run before pushing
```

## Production

```bash
bun run build   # builds apps/web/dist
bun start       # API on :3001 with SERVE_WEB=1, serving the built web app
```

On the host this runs as the systemd user service in `scripts/znab.service`
(install steps are in the file). After a rebuild:
`systemctl --user restart znab`. `scripts/restart-web.sh` (`bun run
web:restart`) clears the Vite cache and restarts the web dev server.

---

## Adding shadcn/ui components

```bash
cd apps/web
bunx shadcn@latest add button card input label
```

The `components.json` is already configured for Tailwind v4.

---

## Project structure

```
znab/
├── apps/
│   ├── api/                  # Hono + tRPC + Drizzle
│   │   └── src/
│   │       ├── index.ts      # Entry point (Bun HTTP server)
│   │       ├── context.ts    # tRPC context (user resolution)
│   │       ├── trpc.ts       # Router base + procedures
│   │       ├── routers/      # one tRPC router per area (budget, account, transaction, ...)
│   │       ├── lib/          # pure logic (budget math, reconcile, YNAB 4 import) + tests
│   │       └── scripts/      # import-yfull.ts
│   └── web/                  # React + Vite + TanStack Router
│       └── src/
│           ├── routes/       # File-based routes (routeTree.gen.ts is generated and committed)
│           ├── components/   # App components; ui/ is shadcn
│           ├── hooks/        # tRPC query and mutation hooks
│           ├── lib/          # pure helpers + tests
│           ├── store/        # Zustand (user selection)
│           ├── trpc.ts       # tRPC React client
│           └── styles/       # Tailwind v4 globals
├── packages/
│   ├── db/                   # Drizzle schema + migrations
│   └── shared/               # Zod schemas + types (used by both)
├── scripts/                  # systemd units, YNAB 4 sync, restart-web.sh
└── seed-data/                # YNAB 4 .yfull exports (gitignored)
```

## Key conventions

- All money stored as `NUMERIC(12,2)` in Postgres, never floats
- Amounts: positive = inflow, negative = outflow
- Soft-deletes via `deleted_at` timestamp (never hard-delete YNAB data)
- Budget month in URLs: `MM/YYYY` (e.g. `?month=03/2026`)
- Budget month in DB: `YYYY-MM-01` (ISO date, always first of month)
- User identity: `x-user-slug` header on every tRPC request (set by Zustand store)
