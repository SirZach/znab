import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegisterSort, SortDirection } from "@znab/shared";
import { SortHeader } from "./sort-header";

function renderHeader(props: { column: RegisterSort; label: string; sort: RegisterSort; dir: SortDirection }) {
  const onSort = mock((_column: RegisterSort, _dir: SortDirection) => {});
  render(
    <table>
      <thead>
        <tr>
          <SortHeader {...props} onSort={onSort} />
        </tr>
      </thead>
    </table>
  );
  return { onSort, header: screen.getByRole("columnheader") };
}

describe("SortHeader", () => {
  test("clicking the active column flips its direction", async () => {
    const { onSort, header } = renderHeader({ column: "amount", label: "Outflow", sort: "amount", dir: "asc" });
    expect(header.getAttribute("aria-sort")).toBe("ascending");

    await userEvent.click(screen.getByRole("button", { name: "Outflow" }));
    expect(onSort).toHaveBeenCalledWith("amount", "desc");
  });

  test("clicking date from another column starts newest first", async () => {
    const { onSort, header } = renderHeader({ column: "date", label: "Date", sort: "payee", dir: "asc" });
    expect(header.getAttribute("aria-sort")).toBe("none");

    await userEvent.click(screen.getByRole("button", { name: "Date" }));
    expect(onSort).toHaveBeenCalledWith("date", "desc");
  });
});
