# ZNAB — Setup Guide

## Prerequisites

- **Bun** ≥ 1.1 — [bun.sh](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- **Docker** — for running PostgreSQL locally
- Seed data in `./seed-data/` (already present)

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

## 4. Generate and run database migrations

```bash
# Generate SQL from the Drizzle schema
bun db:generate

# Apply migrations to the database
bun db:migrate
```

## 5. Import seed data

```bash
bun import
```

This seeds the two users (`zach` and `demo`), imports `Budget.yfull` and
`Budget-Fiona.yfull` under the `zach` user, and creates a Demo budget under
the `demo` user. The script is fully idempotent — safe to run again.

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

Open http://localhost:5173 — you'll see the user picker.

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
│   │       ├── routers/      # budget, account, transaction
│   │       └── scripts/
│   │           └── import-yfull.ts
│   └── web/                  # React + Vite + TanStack Router
│       └── src/
│           ├── routes/       # File-based routes
│           ├── store/        # Zustand (user selection)
│           ├── trpc.ts       # tRPC React client
│           └── styles/       # Tailwind v4 globals
├── packages/
│   ├── db/                   # Drizzle schema + migrations
│   └── shared/               # Zod schemas + types (used by both)
└── seed-data/                # YNAB 4 .yfull exports
```

## Key conventions

- All money stored as `NUMERIC(12,2)` in Postgres — never floats
- Amounts: positive = inflow, negative = outflow
- Soft-deletes via `deleted_at` timestamp (never hard-delete YNAB data)
- Budget month in URLs: `MM/YYYY` (e.g. `?month=03/2026`)
- Budget month in DB: `YYYY-MM-01` (ISO date, always first of month)
- User identity: `x-user-slug` header on every tRPC request (set by Zustand store)
