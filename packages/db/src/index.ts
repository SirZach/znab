// The web app pulls this file in through the tRPC router types, and compiles it
// under its own tsconfig, which has no Bun globals. Carry them on the file.
/// <reference types="bun" />
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// For use in long-running server processes
const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export * from "./schema";
export { schema };
