import { describe, expect, test } from "bun:test";
import { formatDateEntry, offsetDays, parseDateEntry } from "./date-entry";

/** A fixed day to read everything against: a Friday in September. */
const today = new Date(2026, 8, 18);

/** What a parsed date says, in a form that is easy to read in a failure. */
const on = (input: string, from = today) => {
  const d = parseDateEntry(input, from);
  return d === null ? null : formatDateEntry(d);
};

describe("parseDateEntry: nothing to read yet", () => {
  test("an empty field is not a date", () => {
    expect(parseDateEntry("", today)).toBeNull();
    expect(parseDateEntry("   ", today)).toBeNull();
  });

  test("half-typed nonsense is left alone rather than guessed at", () => {
    // Null is what stops the field fighting somebody mid-keystroke.
    expect(parseDateEntry("sept", today)).toBeNull();
    expect(parseDateEntry("//", today)).toBeNull();
    expect(parseDateEntry("9/", today)).toBeNull();
  });
});

describe("parseDateEntry: the words", () => {
  test("today, and its initial", () => {
    expect(on("today")).toBe("09/18/2026");
    expect(on("t")).toBe("09/18/2026");
    expect(on("  TODAY  ")).toBe("09/18/2026");
  });

  test("yesterday, which is the one a receipt usually needs", () => {
    expect(on("yesterday")).toBe("09/17/2026");
    expect(on("y")).toBe("09/17/2026");
  });

  test("tomorrow, for something already known about", () => {
    expect(on("tomorrow")).toBe("09/19/2026");
    expect(on("tom")).toBe("09/19/2026");
  });
});

describe("parseDateEntry: a number of days either side", () => {
  test("counts back", () => {
    expect(on("-1")).toBe("09/17/2026");
    expect(on("-3")).toBe("09/15/2026");
  });

  test("and forward", () => {
    expect(on("+1")).toBe("09/19/2026");
  });

  test("across a month end", () => {
    expect(on("-20")).toBe("08/29/2026");
  });

  test("across a year end", () => {
    expect(on("-300", new Date(2026, 0, 5))).toBe("03/11/2025");
  });
});

describe("parseDateEntry: a day of the month being worked in", () => {
  test("a bare number is that day of this month", () => {
    expect(on("3")).toBe("09/03/2026");
    expect(on("28")).toBe("09/28/2026");
  });

  test("a day the month does not have is not a date", () => {
    // September has 30 days, so the 31st is a typo rather than a date.
    expect(on("31")).toBeNull();
    expect(on("0")).toBeNull();
  });
});

describe("parseDateEntry: month and day", () => {
  test("slashes or dashes, this year by default", () => {
    expect(on("9/18")).toBe("09/18/2026");
    expect(on("9-18")).toBe("09/18/2026");
    expect(on("12/1")).toBe("12/01/2026");
  });

  test("a two digit year means this century", () => {
    expect(on("9/18/26")).toBe("09/18/2026");
  });

  test("and a four digit one is taken as it stands", () => {
    expect(on("9/18/2013")).toBe("09/18/2013");
  });

  test("the way the database writes it is understood too", () => {
    expect(on("2026-09-18")).toBe("09/18/2026");
    expect(on("2013-09-12")).toBe("09/12/2013");
  });

  test("a day that month does not have is refused", () => {
    expect(on("2/30")).toBeNull();
    expect(on("13/1")).toBeNull();
    expect(on("2026-02-30")).toBeNull();
  });

  test("a leap day is real in a leap year and not otherwise", () => {
    expect(on("2/29/2024")).toBe("02/29/2024");
    expect(on("2/29/2026")).toBeNull();
  });
});

describe("offsetDays: stays on local midnight", () => {
  test("crosses a month end", () => {
    expect(formatDateEntry(offsetDays(new Date(2026, 8, 30), 1))).toBe("10/01/2026");
  });

  test("and a leap day", () => {
    expect(formatDateEntry(offsetDays(new Date(2024, 1, 28), 1))).toBe("02/29/2024");
  });

  test("a date taken apart and put back together is the same day", () => {
    // The register reads dates at local midnight throughout, so a round trip
    // through here must not shift one into the day before.
    const d = offsetDays(new Date(2026, 8, 18, 23, 30), 0);
    expect(formatDateEntry(d)).toBe("09/18/2026");
    expect(d.getHours()).toBe(0);
  });
});
