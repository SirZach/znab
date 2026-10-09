/**
 * The household split spreadsheet: what two people earned, what their master
 * budgets take, and how what is left over is shared out. Deliberately free of
 * database and tRPC imports, like the budget math beside it.
 */

import { fromCents, toCents } from "@znab/shared";

export type SplitPerson = { income: number; master: number };

export type HouseholdSplit = {
  incomeTotal: number;
  masterTotal: number;
  leftOver: number;
  saving: number;
  partnerLeftOver: number;
  primaryLeftOver: number;
};

/**
 * All dollars. Sums are taken in whole cents so they stay exact; the saving is
 * a percentage and may land between cents, which is kept so the primary's
 * share is exact too, and only rounded where it is shown. The whole saving
 * comes out of the primary's share.
 */
export function computeHouseholdSplit(args: {
  primary: SplitPerson;
  partner: SplitPerson;
  savingsPercent: number;
}): HouseholdSplit {
  const { primary, partner, savingsPercent } = args;
  const incomeTotal = toCents(primary.income) + toCents(partner.income);
  const masterTotal = toCents(primary.master) + toCents(partner.master);
  const leftOver = incomeTotal - masterTotal;
  const saving = (leftOver * savingsPercent) / 100;
  const partnerLeftOver = toCents(partner.income) - toCents(partner.master);
  const primaryLeftOver = leftOver - (saving + partnerLeftOver);

  return {
    incomeTotal: fromCents(incomeTotal),
    masterTotal: fromCents(masterTotal),
    leftOver: fromCents(leftOver),
    saving: fromCents(saving),
    partnerLeftOver: fromCents(partnerLeftOver),
    primaryLeftOver: fromCents(primaryLeftOver),
  };
}
