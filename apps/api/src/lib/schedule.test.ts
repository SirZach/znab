import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  isOneOff,
  nextOccurrence,
  occurrencesThrough,
  type Recurrence,
} from "./schedule";

/** A schedule, named the way the rules read. */
const every = (
  frequency: Recurrence["frequency"],
  date: string,
  twiceMonthDay?: number | null,
): Recurrence => ({ date, frequency, twiceMonthDay });

describe("daysInMonth: the lengths the calendar actually has", () => {
  test("the short months are short", () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 11)).toBe(30);
  });

  test("February follows the whole leap rule, not just the four-year one", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("addDays: stepping without ever touching Date", () => {
  test("crosses a month end", () => {
    expect(addDays("2026-01-28", 5)).toBe("2026-02-02");
  });

  test("crosses a year end", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  test("crosses February in a leap year", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  test("steps backwards too", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("a step of nothing is the day itself", () => {
    expect(addDays("2026-09-17", 0)).toBe("2026-09-17");
  });
});

describe("addMonths: keeping the day of the month where the month allows", () => {
  test("an ordinary day survives the step", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-01-15", 14)).toBe("2027-03-15");
  });

  test("a day the month does not have takes the last day it does", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 3)).toBe("2026-04-30");
  });

  test("the anchor is what returns the series to the 31st, not the clamped date", () => {
    // Stepping month by month from a clamped February would strand the series
    // on the 28th forever. Measuring every step from the anchor does not.
    expect(addMonths("2026-01-31", 2, 31)).toBe("2026-03-31");
  });

  test("steps backwards across a year boundary", () => {
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
  });
});

describe("daysBetween: two civil dates subtracted", () => {
  test("counts across months and leap days", () => {
    expect(daysBetween("2026-09-17", "2026-09-18")).toBe(1);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
  });

  test("is negative the other way round", () => {
    expect(daysBetween("2026-09-18", "2026-09-17")).toBe(-1);
  });
});

describe("isOneOff: only Once never comes round again", () => {
  test("Once is the one", () => {
    expect(isOneOff("Once")).toBe(true);
    expect(isOneOff("Monthly")).toBe(false);
    expect(isOneOff("TwiceAMonth")).toBe(false);
  });
});

describe("occurrencesThrough: the dates a schedule falls on", () => {
  test("a schedule due later than the horizon has nothing in range", () => {
    expect(occurrencesThrough(every("Monthly", "2026-12-01"), "2026-09-30")).toEqual([]);
  });

  test("its own date comes first, because that is its next occurrence", () => {
    expect(occurrencesThrough(every("Monthly", "2026-09-01"), "2026-09-30")).toEqual([
      "2026-09-01",
    ]);
  });

  test("Once happens once and is not repeated", () => {
    expect(occurrencesThrough(every("Once", "2026-09-01"), "2027-12-31")).toEqual([
      "2026-09-01",
    ]);
  });

  test("the day-stepping frequencies step by their own number of days", () => {
    expect(occurrencesThrough(every("Daily", "2026-09-17"), "2026-09-20")).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(occurrencesThrough(every("Weekly", "2026-09-17"), "2026-10-08")).toEqual([
      "2026-09-17",
      "2026-09-24",
      "2026-10-01",
      "2026-10-08",
    ]);
    expect(occurrencesThrough(every("EveryOtherWeek", "2026-09-17"), "2026-10-15")).toEqual([
      "2026-09-17",
      "2026-10-01",
      "2026-10-15",
    ]);
    expect(occurrencesThrough(every("Every4Weeks", "2026-09-17"), "2026-11-12")).toEqual([
      "2026-09-17",
      "2026-10-15",
      "2026-11-12",
    ]);
  });

  test("the month-stepping frequencies step by their own number of months", () => {
    expect(occurrencesThrough(every("Monthly", "2026-01-10"), "2026-04-30")).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
    ]);
    expect(occurrencesThrough(every("EveryOtherMonth", "2026-01-10"), "2026-06-30")).toEqual([
      "2026-01-10",
      "2026-03-10",
      "2026-05-10",
    ]);
    expect(occurrencesThrough(every("Every3Months", "2026-01-10"), "2026-12-31")).toEqual([
      "2026-01-10",
      "2026-04-10",
      "2026-07-10",
      "2026-10-10",
    ]);
    expect(occurrencesThrough(every("Every4Months", "2026-01-10"), "2026-12-31")).toEqual([
      "2026-01-10",
      "2026-05-10",
      "2026-09-10",
    ]);
    expect(occurrencesThrough(every("TwiceAYear", "2026-01-10"), "2027-01-31")).toEqual([
      "2026-01-10",
      "2026-07-10",
      "2027-01-10",
    ]);
    expect(occurrencesThrough(every("Yearly", "2026-01-10"), "2028-12-31")).toEqual([
      "2026-01-10",
      "2027-01-10",
      "2028-01-10",
    ]);
  });

  test("a monthly schedule on the 31st returns to the 31st after a short month", () => {
    expect(occurrencesThrough(every("Monthly", "2026-01-31"), "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  test("TwiceAMonth falls on its start day and a fortnight later", () => {
    expect(
      occurrencesThrough(every("TwiceAMonth", "2026-04-01", 1), "2026-05-31"),
    ).toEqual(["2026-04-01", "2026-04-16", "2026-05-01", "2026-05-16"]);
  });

  test("TwiceAMonth from the 15th, which is the pair the export actually carries", () => {
    expect(
      occurrencesThrough(every("TwiceAMonth", "2017-05-15", 15), "2017-06-30"),
    ).toEqual(["2017-05-15", "2017-05-30", "2017-06-15", "2017-06-30"]);
  });

  test("the second of a pair is clamped into a short month", () => {
    expect(
      occurrencesThrough(every("TwiceAMonth", "2026-02-15", 15), "2026-02-28"),
    ).toEqual(["2026-02-15", "2026-02-28"]);
  });

  test("a start day whose pair collides on the last day happens once that month", () => {
    // The 30th of a 28-day February cannot come round twice.
    expect(
      occurrencesThrough(every("TwiceAMonth", "2026-02-28", 30), "2026-02-28"),
    ).toEqual(["2026-02-28"]);
  });

  test("a zero start day means unset, so the schedule's own day is used", () => {
    // YNAB 4 writes twiceAMonthStartDay: 0 on every schedule that is not
    // TwiceAMonth, and the importer stores that 0 rather than a null.
    expect(
      occurrencesThrough(every("TwiceAMonth", "2026-04-10", 0), "2026-04-30"),
    ).toEqual(["2026-04-10", "2026-04-25"]);
  });

  test("the cap holds a daily schedule to a readable number of rows", () => {
    expect(occurrencesThrough(every("Daily", "2026-01-01"), "2026-12-31", 3)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(occurrencesThrough(every("Daily", "2026-01-01"), "2026-12-31")).toHaveLength(24);
  });

  test("a cap of nothing asks for nothing", () => {
    expect(occurrencesThrough(every("Daily", "2026-01-01"), "2026-12-31", 0)).toEqual([]);
  });
});

describe("nextOccurrence: where entering or skipping moves the schedule on to", () => {
  test("Once never comes round again", () => {
    expect(nextOccurrence(every("Once", "2026-09-01"), "2026-09-01")).toBeNull();
  });

  test("a schedule already due later is left where it is", () => {
    expect(nextOccurrence(every("Monthly", "2026-12-01"), "2026-09-17")).toBe("2026-12-01");
  });

  test("entering today's occurrence moves it to the next one", () => {
    expect(nextOccurrence(every("Monthly", "2026-09-17"), "2026-09-17")).toBe("2026-10-17");
    expect(nextOccurrence(every("Weekly", "2026-09-17"), "2026-09-17")).toBe("2026-09-24");
  });

  test("a schedule left alone for years catches up to just past the date asked for", () => {
    expect(nextOccurrence(every("Daily", "2013-01-01"), "2026-09-17")).toBe("2026-09-18");
    expect(nextOccurrence(every("Monthly", "2013-11-08"), "2026-09-17")).toBe("2026-10-08");
    // A weekly series keeps the weekday it started on: 2013-01-01 was a
    // Tuesday, and the first Tuesday of that series after the 17th is the 22nd.
    expect(nextOccurrence(every("Weekly", "2013-01-01"), "2026-09-17")).toBe("2026-09-22");
  });

  test("catching up keeps the anchor, so the 31st is still the 31st", () => {
    expect(nextOccurrence(every("Monthly", "2026-01-31"), "2026-02-28")).toBe("2026-03-31");
  });

  test("the answer is always strictly after the date asked about", () => {
    // A schedule due on the 1st, asked about on the 1st, must not answer the 1st
    // again: entering it would otherwise leave it due forever.
    expect(nextOccurrence(every("Monthly", "2026-09-01"), "2026-09-01")).toBe("2026-10-01");
    expect(nextOccurrence(every("TwiceAMonth", "2026-04-01", 1), "2026-04-16")).toBe(
      "2026-05-01",
    );
  });

  test("TwiceAMonth alternates between the two days of its pair", () => {
    const pair = every("TwiceAMonth", "2026-04-01", 1);
    expect(nextOccurrence(pair, "2026-04-01")).toBe("2026-04-16");
    expect(nextOccurrence(pair, "2026-04-16")).toBe("2026-05-01");
  });

  test("TwiceAMonth catches up across a long gap", () => {
    expect(nextOccurrence(every("TwiceAMonth", "2017-05-15", 15), "2026-09-17")).toBe(
      "2026-09-30",
    );
  });

  test("every frequency moves forward rather than standing still", () => {
    const frequencies = [
      "Daily",
      "Weekly",
      "EveryOtherWeek",
      "TwiceAMonth",
      "Every4Weeks",
      "Monthly",
      "EveryOtherMonth",
      "Every3Months",
      "Every4Months",
      "TwiceAYear",
      "Yearly",
    ] as const;
    for (const frequency of frequencies) {
      const next = nextOccurrence(every(frequency, "2026-09-17"), "2026-09-17");
      expect(next).not.toBeNull();
      expect(next! > "2026-09-17").toBe(true);
    }
  });
});
