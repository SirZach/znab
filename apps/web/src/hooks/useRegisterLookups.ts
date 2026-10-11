import { trpc } from "@/trpc";
import { toCategoryOptions } from "@/lib/category-options";
import { payeeAutofillPatch } from "@/lib/payee-autofill";
import type { PayeeAutofillSource, RegisterDraft } from "@/lib/payee-autofill";
import { transferKeepsCategory } from "@/lib/register-edit";

export type RegisterLookups = ReturnType<typeof useRegisterLookups>;

/** The account being viewed, and what its rows can pick from. */
export function useRegisterLookups({
  budgetId,
  accountId,
}: {
  budgetId: number;
  accountId: number;
}) {
  const { data: accounts } = trpc.account.list.useQuery({ budgetId });
  const account = accounts?.find((a) => a.id === accountId);

  const { data: categoryGroups } = trpc.category.list.useQuery({ budgetId });
  const { data: allPayees } = trpc.payee.list.useQuery({ budgetId });

  // An account cannot transfer to itself, and the API refuses it, so its own
  // stand-in payee is not worth offering in its own register.
  const payeeList = allPayees?.filter((p) => p.targetAccountId !== accountId);

  const categoryOptions = toCategoryOptions(categoryGroups);

  return {
    account,
    payeeList,
    categoryOptions,
    /**
     * What picking this payee should prefill, bound to the picker's own options
     * so autofill can never set a category the register has no way to display.
     */
    autofillForPayee: (payee: PayeeAutofillSource, draft: RegisterDraft) =>
      payeeAutofillPatch(payee, draft, categoryOptions),
    /** Whether a row moving money to `transferAccountId` carries a category here. */
    transferKeepsCategory: (transferAccountId: number | null) =>
      transferKeepsCategory(account, accounts, transferAccountId),
  };
}
