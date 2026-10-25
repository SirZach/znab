import { join } from "node:path";
import { createApp } from "./app";
import { serveWeb } from "./serve-web";

const app = createApp();

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
  serveWeb(app, webDist);
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
