import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoneyInput } from "./money-input";

function Harness({ onEnter, onKeyDown }: { onEnter: (n: number) => void; onKeyDown?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <MoneyInput
      aria-label="Amount"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onEnter={onEnter}
      onKeyDown={onKeyDown}
    />
  );
}

describe("MoneyInput", () => {
  test("is a decimal text field with a 0.00 placeholder", () => {
    render(<Harness onEnter={() => {}} />);
    const input = screen.getByRole("textbox", { name: "Amount" });

    expect(input.getAttribute("type")).toBe("text");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("placeholder")).toBe("0.00");
  });

  test("Enter hands back the amount typed, arithmetic worked out", async () => {
    const onEnter = mock();
    render(<Harness onEnter={onEnter} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Amount" }), "25+13.5{Enter}");

    expect(onEnter).toHaveBeenCalledWith(38.5);
  });

  test("Enter on something unreadable hands back nothing", async () => {
    const onEnter = mock();
    render(<Harness onEnter={onEnter} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Amount" }), "25+{Enter}");

    expect(onEnter).not.toHaveBeenCalled();
  });

  test("the caller's onKeyDown still sees every key", async () => {
    const onKeyDown = mock();
    render(<Harness onEnter={() => {}} onKeyDown={onKeyDown} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Amount" }), "5{Enter}");

    expect(onKeyDown).toHaveBeenCalledTimes(2);
  });
});
