import { describe, expect, test } from "bun:test";
import { type InvalidateUtils, invalidateBudgeting, invalidateMoney } from "./invalidate";

/** A stand-in for `trpc.useUtils()` that records which routers were invalidated. */
function fakeUtils() {
  const calls: string[] = [];
  const utils = new Proxy({} as InvalidateUtils, {
    get: (_, router) => ({
      invalidate: async () => {
        calls.push(String(router));
      },
    }),
  });
  return { utils, calls };
}

describe("invalidateMoney", () => {
  test("invalidates every router that reads transaction or budget data", async () => {
    const { utils, calls } = fakeUtils();
    await invalidateMoney(utils);
    expect(calls.sort()).toEqual([
      "account",
      "budget",
      "category",
      "householdSplit",
      "payee",
      "report",
      "scheduledTransaction",
    ]);
  });
});

describe("invalidateBudgeting", () => {
  test("invalidates the budget and the household split only", async () => {
    const { utils, calls } = fakeUtils();
    await invalidateBudgeting(utils);
    expect(calls.sort()).toEqual(["budget", "householdSplit"]);
  });
});
