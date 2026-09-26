/**
 * The household split spreadsheet: what two people earned, what their master
 * budgets take, and how what is left over is shared out. Deliberately free of
 * database and tRPC imports, like the budget math beside it.
 */

export type SplitPerson = { income: number; master: number };

export type HouseholdSplit = {
  incomeTotal: number;
  masterTotal: number;
  leftOver: number;
  saving: number;
  partnerLeftOver: number;
  primaryLeftOver: number;
};

const cents = (v: number) => Math.round(v * 100);

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
  const incomeTotal = cents(primary.income) + cents(partner.income);
  const masterTotal = cents(primary.master) + cents(partner.master);
  const leftOver = incomeTotal - masterTotal;
  const saving = (leftOver * savingsPercent) / 100;
  const partnerLeftOver = cents(partner.income) - cents(partner.master);
  const primaryLeftOver = leftOver - (saving + partnerLeftOver);

  return {
    incomeTotal: incomeTotal / 100,
    masterTotal: masterTotal / 100,
    leftOver: leftOver / 100,
    saving: saving / 100,
    partnerLeftOver: partnerLeftOver / 100,
    primaryLeftOver: primaryLeftOver / 100,
  };
}
