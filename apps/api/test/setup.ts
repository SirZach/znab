// Preloaded by bunfig.toml for every `bun test` in apps/api. It only rewrites
// the env, so the DB-free unit tests stay DB-free: postgres.js connects lazily.
// Overriding DATABASE_URL here means a stray `.env` can never aim a test at the
// dev database.
import { testDatabaseUrl } from "./env";

process.env.DATABASE_URL = testDatabaseUrl();
