import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isRedirect } from "@tanstack/react-router";
import { useUserStore } from "@/store/user";
import { requireUser } from "./require-user";

// The store is shared across test files, so start from no user either way.
beforeEach(() => useUserStore.getState().clearUser());
afterEach(() => useUserStore.getState().clearUser());

describe("requireUser", () => {
  test("sends a visitor with no user back to the picker", () => {
    let thrown: unknown;
    try {
      requireUser();
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { to: string } }).options.to).toBe("/");
  });

  test("lets a chosen user through", () => {
    useUserStore.getState().setUser("demo");
    expect(() => requireUser()).not.toThrow();
  });
});
