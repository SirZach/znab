import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db, users } from "@znab/db";
import { eq } from "drizzle-orm";

/** The user a request names in its x-user-slug header, or null when it names nobody. */
export async function userFromRequest(req: Request, database: typeof db = db) {
  const slug = req.headers.get("x-user-slug");
  if (!slug) return null;
  return (await database.query.users.findFirst({ where: eq(users.slug, slug) })) ?? null;
}

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const user = await userFromRequest(req);
  return { db, user, req };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
