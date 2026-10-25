import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import type { TRPCError } from "@trpc/server";
import { db } from "@znab/db";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { createContext } from "./context";

/**
 * Logs tRPC errors that are the server's fault. Client errors (BAD_REQUEST,
 * NOT_FOUND, UNAUTHORIZED, ...) are the API working as intended, so they stay
 * quiet. Goes to stderr, which journald keeps under systemd.
 */
export function logTrpcError({
  error,
  path,
  type,
}: {
  error: TRPCError;
  path: string | undefined;
  type: string;
}) {
  if (error.code !== "INTERNAL_SERVER_ERROR") return;
  console.error(`tRPC ${type} ${path ?? "<unknown>"} failed:`, error.cause ?? error);
}

/**
 * The API without anything that depends on how it is run, so tests can drive it
 * with `app.request`. `ping` is the health check's database probe, swappable so
 * a failing database can be faked.
 */
export function createApp(ping: () => Promise<unknown> = () => db.execute(sql`select 1`)) {
  const app = new Hono();

  // Last resort for anything a route throws. The details go to the log, never
  // to the client.
  app.onError((err, c) => {
    console.error(`${c.req.method} ${c.req.path} failed:`, err);
    return c.json({ error: "Internal server error" }, 500);
  });

  // Dev-only: allow localhost plus access over Tailscale (znab hostname / *.ts.net).
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        try {
          const { hostname } = new URL(origin);
          const allowed =
            hostname === "localhost" ||
            hostname === "znab" ||
            hostname.endsWith(".ts.net");
          return allowed ? origin : null;
        } catch {
          return null;
        }
      },
      credentials: true,
    })
  );

  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext,
      onError: logTrpcError,
    })
  );

  // One round trip to Postgres, so a monitor sees a dead database, not just a
  // live process.
  app.get("/health", async (c) => {
    try {
      await ping();
      return c.json({ ok: true });
    } catch (err) {
      console.error("Health check failed:", err);
      return c.json({ ok: false }, 503);
    }
  });

  return app;
}
