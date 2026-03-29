import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db, users } from "@znab/db";
import { eq } from "drizzle-orm";

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const slug = req.headers.get("x-user-slug");

  const user = slug
    ? await db.query.users.findFirst({ where: eq(users.slug, slug) })
    : null;

  return { db, user, req };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
