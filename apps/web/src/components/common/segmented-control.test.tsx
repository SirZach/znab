import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "./segmented-control";

const options = [
  { value: "in", label: "Move in" },
  { value: "out", label: "Move out" },
] as const;

describe("SegmentedControl", () => {
  test("marks only the chosen option as pressed", () => {
    render(<SegmentedControl options={options} value="out" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Move out" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: "Move in" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  test("hands back the option clicked", async () => {
    const onChange = mock();
    render(<SegmentedControl options={options} value="out" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Move in" }));

    expect(onChange).toHaveBeenCalledWith("in");
  });

  test("its buttons never submit a form", () => {
    render(<SegmentedControl options={options} value="in" onChange={() => {}} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });
});
