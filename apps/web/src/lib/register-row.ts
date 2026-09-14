/**
 * A register row writes one signed amount across two columns, Outflow and
 * Inflow, and reads it back the same way. That conversion, and the question of
 * whether a transfer carries a category at all, are decided here rather than
 * inline in the register, so the add row and the row being edited can only
 * answer them the same way.
 */

import { parseAmountExpression } from "./utils";

/** The two money columns as they are typed, before they mean anything. */
export type MoneyFields = { outflow: string; inflow: string };

/** Everything a register row lets someone enter, on a new row or an old one. */
export type RegisterFields = MoneyFields & {
  date: Date | undefined;
  payeeId: number | null;
  payeeName: string;
  categoryId: number | null;
  memo: string;
};

/**
 * Spread a stored amount across the two columns. Zero fills neither: an amount
 * of nothing is not an outflow of nothing, and seeding an edit with "0.00"
 * under Outflow would leave the reader deleting it before they could type.
 */
export function amountToFields(amount: string | number): MoneyFields {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value) || value === 0) return { outflow: "", inflow: "" };
  return value < 0
    ? { outflow: Math.abs(value).toFixed(2), inflow: "" }
    : { outflow: "", inflow: value.toFixed(2) };
}

/**
 * Read the two columns back as one signed amount, or null when what is there
 * cannot be read as one. Something in both columns is the one genuinely
 * ambiguous entry and is refused rather than guessed at, as is a number that is
 * zero or less: the column it sits in already carries its sign. Two empty
 * columns are an amount of nothing, which is a real amount a row can hold even
 * though it is not one worth entering from scratch.
 */
export function fieldsToAmount(fields: MoneyFields): number | null {
  const outflow = fields.outflow.trim();
  const inflow = fields.inflow.trim();
  if (outflow !== "" && inflow !== "") return null;
  if (outflow === "" && inflow === "") return 0;

  // Arithmetic, not just numbers: the budget grid, the move-money field and the
  // autofill amount all take `25+13`, and the register was the odd one out.
  const value = parseAmountExpression(outflow || inflow);
  // A negative under a column that already means its direction is as ambiguous
  // as filling both columns, so it is refused the same way.
  if (value === null || value < 0) return null;
  if (value === 0) return 0;

  return outflow === "" ? value : -value;
}

/**
 * Whether the side of a transfer held in `own` carries a category. Money moved
 * between two budgeted accounts has not been spent, so YNAB 4 categorises it
 * nowhere; money moved out to a tracking account has been spent, and that is
 * recorded against the on-budget side alone. An account that has not loaded yet
 * is no category either, since there is no telling which case this is.
 */
export function transferCategoryEditable(
  own: { onBudget: boolean } | undefined,
  other: { onBudget: boolean } | undefined
): boolean {
  return own?.onBudget === true && other?.onBudget === false;
}

/**
 * Why this row cannot be saved yet, or null when it can. The register used to
 * drop an unsaveable row on the floor: pressing Enter with both money columns
 * empty, or with something in each of them, did nothing at all and said nothing
 * about why. The answer is worded for the person typing it.
 *
 * `allowZero` is what separates a row already on the books from a new one. A
 * blank new row is not a transaction of nothing, it is someone who has not
 * finished typing. A row that is already worth nothing, and fourteen of them
 * are, has to stay editable, or its memo and payee are locked behind an amount
 * its owner never meant to change.
 */
export function unsaveableReason(
  fields: RegisterFields,
  { allowZero = false }: { allowZero?: boolean } = {}
): string | null {
  if (!fields.date) return "Pick a date first.";
  if (fields.outflow.trim() !== "" && fields.inflow.trim() !== "") {
    return "Enter an outflow or an inflow, not both.";
  }
  const amount = fieldsToAmount(fields);
  if (amount === null) return "That is not an amount.";
  if (amount === 0 && !allowZero) return "Enter an amount greater than zero.";
  return null;
}
