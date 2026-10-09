// Creates the test database if it is missing and brings it up to the latest
// migration. Safe to run any number of times: `bun run test:db` runs it first.
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { testDatabaseUrl } from "./env";

const url = testDatabaseUrl();
const name = new URL(url).pathname.slice(1);

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
try {
  const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
  if (!exists) {
    // `name` is checked against [a-z0-9_] in testDatabaseUrl, so quoting it is safe.
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    console.log(`Created database ${name}`);
  }
} finally {
  await admin.end();
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), {
    migrationsFolder: resolve(import.meta.dir, "../../../packages/db/migrations"),
  });
  console.log(`Database ${name} is migrated`);
} finally {
  await client.end();
}
