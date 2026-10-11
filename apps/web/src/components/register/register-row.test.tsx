import { describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTrpc } from "../../../test/trpc";
import { RegisterRow } from "./register-row";

function renderRow(props: { editing: boolean; error: string | null }) {
  const onClick = mock();
  renderWithTrpc(
    <table>
      <tbody>
        <RegisterRow selected={false} focused={false} onClick={onClick} {...props}>
          <td>cells</td>
        </RegisterRow>
      </tbody>
    </table>
  );
  return { onClick, row: screen.getByText("cells").closest("tr")! };
}

describe("RegisterRow", () => {
  test("a row being read takes the click", async () => {
    const { onClick, row } = renderRow({ editing: false, error: "ignored" });
    await userEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("ignored")).toBeNull();
  });

  test("a row being edited ignores the click and shows its error", async () => {
    const { onClick, row } = renderRow({ editing: true, error: "Refused" });
    await userEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Refused")).toBeTruthy();
  });
});
