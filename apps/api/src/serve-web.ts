import { join, relative } from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";

/**
 * Serves the built web app from `webDist`. Register it after the API routes so
 * nothing here can shadow them.
 */
// biome-ignore lint/suspicious/noExplicitAny: works for any app's env and routes
export function serveWeb(app: Hono<any, any, any>, webDist: string) {
  const indexHtml = join(webDist, "index.html");

  app.use(
    "*",
    serveStatic({
      root: webDist,
      // Files under assets/ carry a content hash and can be cached as long as
      // the browser likes. Everything else (index.html, sw.js, the manifest)
      // keeps its name across deploys, so it has to be revalidated or an
      // installed app goes on running the last build.
      onFound: (path, c) => {
        if (!relative(webDist, path).startsWith("assets/")) c.header("Cache-Control", "no-cache");
      },
    })
  );

  // Everything left is a route belonging to the client's own router, which
  // only exists once the page has loaded, so the page is what to send. A path
  // with an extension is a different thing: an asset that is genuinely missing,
  // and saying so beats handing back the index page under the wrong type and
  // letting the browser fail on it a step later.
  app.get("*", async (c) => {
    if (/\.[^/]+$/.test(c.req.path)) return c.notFound();
    c.header("Cache-Control", "no-cache");
    return c.html(await Bun.file(indexHtml).text());
  });
}
