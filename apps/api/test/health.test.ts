import { expect, test } from "bun:test";
import { createApp } from "../src/app";

test("GET /health reaches the real database", async () => {
  const res = await createApp().request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
