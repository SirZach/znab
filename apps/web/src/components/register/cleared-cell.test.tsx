import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearedCell } from "./cleared-cell";

function renderCell() {
  const onCycle = mock();
  const onRowClick = mock();
  render(
    <table>
      <tbody>
        <tr onClick={onRowClick}>
          <ClearedCell cleared="Uncleared" onCycle={onCycle} />
        </tr>
      </tbody>
    </table>
  );
  return { onCycle, onRowClick };
}

describe("ClearedCell", () => {
  test("a click anywhere in the cell cycles it, without reaching the row", async () => {
    const { onCycle, onRowClick } = renderCell();
    await userEvent.click(screen.getByRole("cell"));
    expect(onCycle).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  test("a click on the icon cycles it once", async () => {
    const { onCycle } = renderCell();
    await userEvent.click(screen.getByRole("button"));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });
});
