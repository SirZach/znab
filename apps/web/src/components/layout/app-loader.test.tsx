import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AppLoader } from "./app-loader";

describe("AppLoader", () => {
  test("announces loading with the logo", () => {
    render(<AppLoader />);

    const status = screen.getByRole("status", { name: "Loading ZNAB" });
    expect(status.className).toBe("app-loader");
    expect(status.querySelector("img")?.getAttribute("src")).toBe("/favicon.svg");
  });
});
