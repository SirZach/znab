import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { serveWeb } from "./serve-web";

let dist: string;
const app = createApp(async () => {});

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), "znab-dist-"));
  await Bun.write(join(dist, "index.html"), "<!doctype html><title>ZNAB</title>");
  await Bun.write(join(dist, "sw.js"), "self.skipWaiting();");
  await Bun.write(join(dist, "manifest.webmanifest"), '{"name":"ZNAB"}');
  await Bun.write(join(dist, "assets/index-abc123.js"), "export {};");
  serveWeb(app, dist);
});
afterAll(() => rm(dist, { recursive: true, force: true }));

describe("serving the built web app", () => {
  test("the service worker is JavaScript and is revalidated on every load", async () => {
    const res = await app.request("/sw.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/javascript");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("self.skipWaiting();");
  });

  test("the manifest is served as a manifest, not swallowed by the page fallback", async () => {
    const res = await app.request("/manifest.webmanifest");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/manifest+json");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("hashed assets are left cacheable", async () => {
    const res = await app.request("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  test("a client route gets the page, revalidated", async () => {
    const res = await app.request("/budgets/1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("a missing file is a 404, and API routes still win", async () => {
    expect((await app.request("/nope.js")).status).toBe(404);
    expect(await (await app.request("/health")).json()).toEqual({ ok: true });
  });
});
