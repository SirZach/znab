import { FREQUENCY_VALUES, type FrequencyValue } from "@znab/shared";

/**
 * How each frequency is written for a reader. YNAB 4's own vocabulary is
 * CamelCase on the wire and plain English on the screen.
 */
export const FREQUENCY_LABELS: Record<FrequencyValue, string> = {
  Once: "Once",
  Daily: "Daily",
  Weekly: "Weekly",
  EveryOtherWeek: "Every other week",
  TwiceAMonth: "Twice a month",
  Every4Weeks: "Every 4 weeks",
  Monthly: "Monthly",
  EveryOtherMonth: "Every other month",
  Every3Months: "Every 3 months",
  Every4Months: "Every 4 months",
  TwiceAYear: "Twice a year",
  Yearly: "Yearly",
};

/** The frequencies in the order YNAB 4 offers them, for a picker. */
export const FREQUENCY_OPTIONS = FREQUENCY_VALUES.map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
}));

/**
 * How a frequency is written. The column behind it is plain text carrying
 * whatever the export said, so a value from a later YNAB shows as itself rather
 * than as the word "undefined".
 */
export function frequencyLabel(frequency: string): string {
  return FREQUENCY_LABELS[frequency as FrequencyValue] ?? frequency;
}

/** A schedule that happens once has nowhere to skip to, and the API refuses it. */
export function canSkip(frequency: string): boolean {
  return frequency !== "Once";
}

/**
 * How far behind a schedule is, said in words. A schedule imported years ago
 * and never entered is behind by more than one occurrence, and saying so is
 * what explains why entering it once leaves it still due.
 */
export function behindLabel(dueCount: number): string | null {
  if (dueCount <= 1) return null;
  return `${dueCount} occurrences due`;
}

/** One occurrence as the API hands it over, narrowed to what a register shows. */
export type UpcomingOccurrence = {
  scheduledTransactionId: number;
  date: string;
  due: boolean;
  payeeName: string | null;
  categoryName: string | null;
  isTransfer: boolean;
  amount: string;
  frequency: FrequencyValue;
};

export type UpcomingRow = UpcomingOccurrence & {
  /** Whether this is the occurrence the schedule is standing on. */
  enterable: boolean;
  /** How far behind the schedule is, where that is worth saying. */
  behind: string | null;
};

/**
 * The occurrences as rows. Only the earliest occurrence of a schedule can be
 * entered, because entering it is what moves the schedule on to the next one,
 * so a schedule missed a dozen times is one row saying how far behind it is
 * rather than a dozen rows nobody can act on. Occurrences still to come are
 * listed as they are, without buttons.
 */
export function upcomingRows(occurrences: readonly UpcomingOccurrence[]): UpcomingRow[] {
  const dueCounts = new Map<number, number>();
  for (const o of occurrences) {
    if (o.due) {
      const id = o.scheduledTransactionId;
      dueCounts.set(id, (dueCounts.get(id) ?? 0) + 1);
    }
  }

  const seen = new Set<number>();
  return occurrences.flatMap((o) => {
    const enterable = !seen.has(o.scheduledTransactionId);
    seen.add(o.scheduledTransactionId);
    // A further occurrence already counted on the schedule's own row.
    if (!enterable && o.due) return [];
    return [
      {
        ...o,
        enterable,
        behind: enterable ? behindLabel(dueCounts.get(o.scheduledTransactionId) ?? 0) : null,
      },
    ];
  });
}
