import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { createApp, logTrpcError } from "./app";

let errorLog: ReturnType<typeof spyOn<Console, "error">>;
beforeEach(() => {
  errorLog = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

describe("GET /health", () => {
  test("is ok when the database answers", async () => {
    const res = await createApp(async () => {}).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("is 503 when the database does not, and logs why", async () => {
    const res = await createApp(async () => {
      throw new Error("connection refused");
    }).request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});

test("an error thrown by a route is logged and answered with a generic 500", async () => {
  const app = createApp(async () => {});
  const boom = new Error("secret detail");
  app.get("/boom", () => {
    throw boom;
  });
  const res = await app.request("/boom");
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Internal server error" });
  expect(errorLog).toHaveBeenCalledWith("GET /boom failed:", boom);
});

describe("logTrpcError", () => {
  test("logs internal errors with path, type and cause", () => {
    const cause = new Error("db down");
    logTrpcError({
      error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause }),
      path: "budget.byId",
      type: "query",
    });
    expect(errorLog).toHaveBeenCalledWith("tRPC query budget.byId failed:", cause);
  });

  test("stays quiet for client errors", () => {
    for (const code of ["BAD_REQUEST", "NOT_FOUND", "UNAUTHORIZED"] as const) {
      logTrpcError({ error: new TRPCError({ code }), path: "budget.byId", type: "query" });
    }
    expect(errorLog).not.toHaveBeenCalled();
  });
});
