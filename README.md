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
bun db:generate                  # generate SQL from the Drizzle schema
bun db:migrate                   # apply migrations
bun import                       # seed users + import budget data (idempotent)
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

For full setup details, database conventions, and project structure, see [SETUP.md](./SETUP.md).
