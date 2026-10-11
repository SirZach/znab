# znab

A Bun monorepo: `apps/api` (Hono + tRPC + Drizzle) and `apps/web` (React + Vite + TanStack Router).

## Running the dev servers

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- Docker (for local PostgreSQL)

### First-time setup

```bash
bun install                      # install all workspace dependencies
docker compose up -d             # start PostgreSQL on localhost:5432
cp .env.example apps/api/.env    # API env
cp .env.example packages/db/.env # DB (Drizzle) env
bun db:migrate                   # apply the committed migrations
bun import                       # seed users + import ./seed-data/*.yfull (idempotent)
```

### Start both servers

```bash
bun dev
```

This runs the backend and frontend together (output interleaved):

- Backend (API): http://localhost:3001
- Frontend (web): http://localhost:5173

Open http://localhost:5173 to use the app.

### Start them individually

Run each in its own terminal:

```bash
bun dev:api   # backend  -> http://localhost:3001
bun dev:web   # frontend -> http://localhost:5173
```

### Checks

```bash
bun run check   # typecheck, lint (Biome) and tests
bun run test    # tests only (bun test in apps/api and apps/web)
```

### Production

`bun run build` builds the web app, then `bun start` runs the API with
`SERVE_WEB=1` so it also serves `apps/web/dist` on port 3001. On the host this
runs as the user service in `scripts/znab.service` (install steps are in that
file). `scripts/restart-web.sh` (`bun run web:restart`) clears the Vite cache
and restarts the web dev server.

For full setup details, database conventions, and project structure, see [SETUP.md](./SETUP.md).
