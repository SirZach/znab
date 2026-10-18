import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { currentMonthParam } from "@/lib/utils";
import { useUserStore } from "@/store/user";

async function land(url: string) {
  useUserStore.setState({ userSlug: "test" });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient: new QueryClient(), userSlug: "test" },
  });
  await router.load();
  return router.state.location;
}

describe("budget page", () => {
  test("opening a budget lands on the current month", async () => {
    const location = await land("/budgets/1");
    expect(location.pathname).toBe("/budgets/1");
    expect(location.search).toEqual({ month: currentMonthParam() });
  });

  test("a month in the link is kept", async () => {
    const location = await land("/budgets/1?month=03%2F2025");
    expect(location.search).toEqual({ month: "03/2025" });
  });
});
