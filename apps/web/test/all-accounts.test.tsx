import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "./router";

const fixtures = {
  "budget.byId": { id: 1, name: "Household" },
  "account.list": [],
  "account.transactions": {
    transactions: [],
    balance: 0,
    total: 0,
    matches: 0,
    counts: { all: 0, Uncleared: 0, Cleared: 0, Reconciled: 0 },
    hasMore: false,
  },
};

/** What the register asked the API for last. */
const lastQuery = (inputsTo: (path: string) => unknown[]) =>
  inputsTo("account.transactions").at(-1);

describe("All Accounts search params", () => {
  test("defaults to newest first from the first page", async () => {
    const { inputsTo } = await renderRoute("/budgets/1/accounts/all", { fixtures });

    await waitFor(() => expect(inputsTo("account.transactions").length).toBeGreaterThan(0));
    expect(lastQuery(inputsTo)).toMatchObject({ sort: "date", dir: "desc", offset: 0, cleared: "all" });
  });

  test("reads the filter, sort and page from the URL", async () => {
    const { inputsTo } = await renderRoute(
      "/budgets/1/accounts/all?q=rent&cleared=Cleared&sort=payee&dir=asc&offset=200",
      { fixtures }
    );

    await waitFor(() => expect(inputsTo("account.transactions").length).toBeGreaterThan(0));
    expect(lastQuery(inputsTo)).toMatchObject({
      q: "rent",
      cleared: "Cleared",
      sort: "payee",
      dir: "asc",
      offset: 200,
    });
  });

  test("sorting writes to the URL and goes back to the first page", async () => {
    const { router } = await renderRoute("/budgets/1/accounts/all?offset=200", { fixtures });

    await userEvent.click(await screen.findByRole("button", { name: /Payee/ }));

    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "payee", offset: 0 }));
  });
});
