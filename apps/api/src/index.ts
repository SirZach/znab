import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./routers";
import { createContext } from "./context";

const app = new Hono();

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
  })
);

app.get("/health", (c) => c.json({ ok: true }));

/**
 * In production this server is the whole app: the web side is 1.3MB of files
 * that were built once, and serving them needs no process of its own. Running
 * vite to hand them over instead costs something like 640MB of a machine that
 * has 2GB, which is most of the reason this exists.
 *
 * Opt in rather than automatic, since the built files go on sitting in the tree
 * while the dev server is the one being used, and an API quietly serving a
 * week-old build on another port is a confusing thing to debug.
 */
if (process.env.SERVE_WEB) {
  const webDist = join(import.meta.dir, "../../web/dist");
  const indexHtml = join(webDist, "index.html");

  if (!(await Bun.file(indexHtml).exists())) {
    console.error(`SERVE_WEB is set but ${webDist} has no build in it.`);
    console.error("Run `bun run build` first, or unset SERVE_WEB.");
    process.exit(1);
  }

  // Registered after the API routes above, so nothing here can shadow them.
  app.use("*", serveStatic({ root: webDist }));

  // Everything left is a route belonging to the client's own router, which
  // only exists once the page has loaded, so the page is what to send. A path
  // with an extension is a different thing: an asset that is genuinely missing,
  // and saying so beats handing back the index page under the wrong type and
  // letting the browser fail on it a step later.
  app.get("*", async (c) =>
    /\.[^/]+$/.test(c.req.path) ? c.notFound() : c.html(await Bun.file(indexHtml).text())
  );
}

const port = Number(process.env.API_PORT ?? 3001);
console.log(
  process.env.SERVE_WEB
    ? `znab running on http://localhost:${port}`
    : `API running on http://localhost:${port}`
);

export default {
  port,
  fetch: app.fetch,
};
