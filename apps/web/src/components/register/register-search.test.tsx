import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterSearch } from "./register-search";

/** Comfortably past the 250ms the box waits for typing to settle. */
const SETTLED = 300;

function setup() {
  const onSearch = mock((_q: string) => {});
  const user = userEvent.setup({ delay: null });
  const rendered = render(
    <RegisterSearch value="" matches={null} total={10} onSearch={onSearch} />
  );
  return { ...rendered, user, onSearch, box: screen.getByLabelText("Search this account") };
}

describe("RegisterSearch", () => {
  test("a word typed in a burst is one search, sent once typing settles", async () => {
    const { user, onSearch, box } = setup();

    await user.type(box, "rent");
    expect(onSearch).not.toHaveBeenCalled();

    await Bun.sleep(SETTLED);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("rent");
  });

  test("Enter sends at once rather than waiting out the settle", async () => {
    const { user, onSearch, box } = setup();

    await user.type(box, "rent{Enter}");
    expect(onSearch).toHaveBeenCalledWith("rent");

    await Bun.sleep(SETTLED);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  test("a search still settling when the box goes away is never sent", async () => {
    const { user, onSearch, box, unmount } = setup();

    await user.type(box, "rent");
    unmount();

    await Bun.sleep(SETTLED);
    expect(onSearch).not.toHaveBeenCalled();
  });
});
