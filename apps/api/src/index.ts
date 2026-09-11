import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./routers";
import { createContext } from "./context";

const app = new Hono();

// Dev-only: allow localhost plus access over Tailscale (zachbox hostname / *.ts.net).
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      try {
        const { hostname } = new URL(origin);
        const allowed =
          hostname === "localhost" ||
          hostname === "zachbox" ||
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
  })
);

app.get("/health", (c) => c.json({ ok: true }));

const port = Number(process.env.API_PORT ?? 3001);
console.log(`API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
