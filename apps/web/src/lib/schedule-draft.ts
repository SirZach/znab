import type { FrequencyValue } from "@znab/shared";
import { formatCurrency, formatDateISO, parseAmountExpression } from "@/lib/utils";

/** What a schedule is made of. A payee may be named instead of picked. */
export type NewScheduled = {
  accountId: number;
  payeeId: number | null;
  payeeName?: string;
  categoryId: number | null;
  /** Negative is an outflow, the way the API reads it. */
  amount: number;
  date: string;
  frequency: FrequencyValue;
  twiceMonthDay?: number | null;
  memo?: string;
};

/** The fields of a stored schedule the form starts from. */
export type ScheduleDraftSource = {
  accountId: number;
  payeeId: number | null;
  payee: { name: string } | null;
  categoryId: number | null;
  amount: string | number;
  date: string;
  frequency: string;
  twiceMonthDay: number | null;
  memo: string | null;
};

/** The schedule form's state. */
export type ScheduleDraft = {
  accountId: number | null;
  payeeId: number | null;
  payeeName: string;
  categoryId: number | null;
  /** Kept apart from the amount so nobody has to type a minus sign. */
  outflow: boolean;
  amount: string;
  date: Date;
  frequency: FrequencyValue;
  twiceMonthDay: number | null;
  memo: string;
};

/** A stored date as the calendar wants it, read as a local day rather than UTC. */
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** The form for a stored schedule, or a blank one dated today. */
export function draftFrom(row: ScheduleDraftSource | undefined): ScheduleDraft {
  if (!row)
    return {
      accountId: null,
      payeeId: null,
      payeeName: "",
      categoryId: null,
      outflow: true,
      amount: "",
      date: new Date(),
      frequency: "Monthly",
      twiceMonthDay: null,
      memo: "",
    };

  const amount = Number(row.amount);
  return {
    accountId: row.accountId,
    payeeId: row.payeeId,
    payeeName: row.payee?.name ?? "",
    categoryId: row.categoryId,
    outflow: amount < 0,
    amount: String(Math.abs(amount)),
    date: toDate(row.date),
    frequency: row.frequency as FrequencyValue,
    twiceMonthDay: row.twiceMonthDay,
    memo: row.memo ?? "",
  };
}

/**
 * Only TwiceAMonth reads a start day, and it falls back to the day the series
 * starts on, which is the answer nearly everyone wants.
 */
export function draftStartDay(draft: ScheduleDraft): number {
  return draft.twiceMonthDay ?? draft.date.getDate();
}

/**
 * The schedule the form describes, or null while it has no account or its
 * amount does not read as one.
 */
export function draftToSchedule(draft: ScheduleDraft): NewScheduled | null {
  const amount = parseAmountExpression(draft.amount);
  if (draft.accountId === null || amount === null) return null;
  const name = draft.payeeName.trim();
  return {
    accountId: draft.accountId,
    payeeId: draft.payeeId,
    // A name with no id behind it is a payee the API makes on the way in.
    ...(draft.payeeId === null && name ? { payeeName: name } : {}),
    categoryId: draft.categoryId,
    amount: draft.outflow ? -Math.abs(amount) : Math.abs(amount),
    date: formatDateISO(draft.date),
    frequency: draft.frequency,
    twiceMonthDay: draft.frequency === "TwiceAMonth" ? draftStartDay(draft) : null,
    memo: draft.memo.trim(),
  };
}

/**
 * What the form clears after an add. The account, the date and the frequency
 * stay put: several schedules are usually added at once, and they tend to share
 * those three.
 */
export const CLEARED_AFTER_ADD: Partial<ScheduleDraft> = {
  payeeId: null,
  payeeName: "",
  categoryId: null,
  amount: "",
  memo: "",
};

/** A schedule named for a dialog or a heading. */
export function scheduleLabel(row: {
  payee: { name: string } | null;
  amount: string | number;
}): string {
  return `${row.payee?.name ?? "No payee"} for ${formatCurrency(row.amount)}`;
}
