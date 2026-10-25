import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUserStore } from "@/store/user";
import { ExportCsvButton } from "./export-csv-button";

afterEach(() => useUserStore.getState().clearUser());

describe("ExportCsvButton", () => {
  test("fetches the export as the signed-in user and saves it under the server's name", async () => {
    useUserStore.getState().setUser("zach");
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Account\r\n", {
        headers: { "Content-Disposition": 'attachment; filename="Home-transactions.csv"' },
      })
    );
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      expect(this.download).toBe("Home-transactions.csv");
    });

    render(<ExportCsvButton budgetId={7} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Export CSV/ }));

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toEndWith("/export/7/transactions.csv");
    expect(init?.headers).toEqual({ "x-user-slug": "zach" });
    expect(click).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
    click.mockRestore();
  });

  test("says so when the export is refused", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));

    render(<ExportCsvButton budgetId={7} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Export CSV/ }));

    expect(await screen.findByText("Export failed (404)")).toBeDefined();
    fetchSpy.mockRestore();
  });
});
