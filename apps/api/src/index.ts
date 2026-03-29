import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./routers";
import { createContext } from "./context";

const app = new Hono();

app.use("*", cors({ origin: "http://localhost:5173", credentials: true }));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
  })
);

app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.API_PORT ?? 3001);
console.log(`API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
