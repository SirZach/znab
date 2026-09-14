import React, { useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/trpc";
import { payeeAutofillPatch } from "@/lib/payee-autofill";
import type { PayeeAutofillSource, RegisterDraft } from "@/lib/payee-autofill";
import { fieldsToAmount, transferCategoryEditable } from "@/lib/register-row";
import type { RegisterFields } from "@/lib/register-row";

/** How many transactions the register loads at a time, newest first. */
const PAGE_SIZE = 200;

/** One row of the register, read back off the hook rather than off the router. */
export type RegisterTransaction = ReturnType<
  typeof useAccountRegister
>["transactions"][number];

export function useAccountRegister({
  budgetId,
  accountId,
  cleared,
  q,
  scrollRef,
  onSaveSuccess,
}: {
  budgetId: number;
  accountId: number;
  cleared: "all" | "Uncleared" | "Cleared" | "Reconciled";
  q: string | undefined;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSaveSuccess?: () => void;
}) {
  const utils = trpc.useUtils();

  // Grows as the reader asks for older transactions. The window stays anchored
  // to the newest transaction, so recent activity is always on screen.
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Reset back to one page whenever the register being viewed changes.
  React.useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [accountId, cleared, q]);

  const { data, isLoading, isFetching } = trpc.account.transactions.useQuery({
    budgetId,
    accountId,
    cleared,
    q,
    limit,
  });

  const { data: accounts } = trpc.account.list.useQuery({ budgetId });
  const account = accounts?.find((a) => a.id === accountId);

  const { data: categoryGroups } = trpc.category.list.useQuery({ budgetId });
  const { data: allPayees } = trpc.payee.list.useQuery({ budgetId });

  // An account cannot transfer to itself, and the API refuses it, so its own
  // stand-in payee is not worth offering in its own register.
  const payeeList = allPayees?.filter((p) => p.targetAccountId !== accountId);

  // Entering or clearing a transaction changes the category's activity, so the
  // budget grid is stale too — not just this register.
  function invalidateRegister() {
    return Promise.all([
      utils.account.transactions.invalidate(),
      utils.budget.monthBudget.invalidate(),
      // Net Worth reads month-end balances straight from the transactions, and
      // an edit can now move money in a month that has long since closed.
      utils.report.netWorth.invalidate(),
    ]);
  }

  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: invalidateRegister,
  });

  // Both of these refetch for the same reason the create below does: an edited
  // date resorts the register, and a deleted transfer takes a row out of
  // another account entirely.
  const updateMutation = trpc.transaction.update.useMutation({
    onSuccess: invalidateRegister,
  });

  const deleteMutation = trpc.transaction.delete.useMutation({
    onSuccess: invalidateRegister,
  });

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: async () => {
      // Refetch rather than patch the cache: a back-dated transaction sorts
      // into the middle of the register, and every running balance at or after
      // it shifts.
      await invalidateRegister();
      setTimeout(
        () =>
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          }),
        0
      );
      onSaveSuccess?.();
    },
  });

  const transactions = data?.transactions ?? [];

  const categoryOptions =
    categoryGroups
      ?.filter((g) => !g.isSystem)
      .flatMap((g) =>
        g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))
      ) ?? [];

  /**
   * What picking this payee should prefill, bound to the picker's own options so
   * autofill can never set a category the register has no way to display.
   */
  function autofillForPayee(payee: PayeeAutofillSource, draft: RegisterDraft) {
    return payeeAutofillPatch(payee, draft, categoryOptions);
  }

  /**
   * Whether a row moving money to `transferAccountId` carries a category in
   * this register. A row that is not a transfer always does; a transfer only
   * does on the on-budget side of a pair whose other side is off budget. The
   * register asks this to decide what to show, and the update below to decide
   * what to send, so the two cannot disagree.
   */
  function transferKeepsCategory(transferAccountId: number | null) {
    return (
      transferAccountId === null ||
      transferCategoryEditable(
        account,
        accounts?.find((a) => a.id === transferAccountId)
      )
    );
  }

  function cycleCleared(current: string, id: number) {
    const next =
      current === "Uncleared"
        ? "Cleared"
        : current === "Cleared"
        ? "Reconciled"
        : "Uncleared";
    setClearedMutation.mutate({
      id,
      cleared: next as "Uncleared" | "Cleared" | "Reconciled",
    });
  }

  function createTransaction(fields: RegisterFields) {
    const amount = fieldsToAmount(fields);
    // A blank new row is someone who has not finished typing, not a
    // transaction of nothing, so zero is refused here but allowed on an edit.
    if (!fields.date || amount === null || amount === 0) return;

    createMutation.mutate({
      budgetId,
      accountId,
      payeeId: fields.payeeId,
      payeeName: fields.payeeId ? undefined : fields.payeeName || undefined,
      categoryId: fields.categoryId,
      amount,
      date: format(fields.date, "yyyy-MM-dd"),
      memo: fields.memo || undefined,
      cleared: "Uncleared",
      accepted: true,
    });
  }

  /**
   * Save what was edited on a row already on the books. A transfer's payee is
   * left out of the update: it is the other account's name, and the API refuses
   * to move one side of a pair to a different payee. An empty memo is sent as
   * the empty string rather than dropped, so a memo can be cleared.
   */
  function updateTransaction(
    txn: {
      id: number;
      isSplit: boolean;
      isTransfer: boolean;
      transferAccountId: number | null;
    },
    fields: RegisterFields,
    onDone?: () => void
  ) {
    const amount = fieldsToAmount(fields);
    if (!fields.date || amount === null) return;

    updateMutation.mutate(
      {
        id: txn.id,
        ...(txn.isTransfer
          ? {}
          : {
              payeeId: fields.payeeId,
              payeeName: fields.payeeId ? undefined : fields.payeeName || undefined,
            }),
        // Absent rather than null where the row shows no category to edit: a
        // transfer's category is held on whichever side is on budget, and a
        // null sent from the other side would clear it there. A split's
        // categories belong to its parts.
        ...(!txn.isSplit && transferKeepsCategory(txn.transferAccountId)
          ? { categoryId: fields.categoryId }
          : {}),
        amount,
        date: format(fields.date, "yyyy-MM-dd"),
        memo: fields.memo,
      },
      { onSuccess: () => onDone?.() }
    );
  }

  // onDone closes the row only once it is really gone, so a refused delete
  // leaves the row open with its error against it.
  function deleteTransaction(id: number, onDone?: () => void) {
    deleteMutation.mutate({ id }, { onSuccess: () => onDone?.() });
  }

  return {
    account,
    transactions,
    balance: data?.balance ?? 0,
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    loadOlder: () => setLimit((n) => n + PAGE_SIZE),
    isLoadingMore: isFetching && !isLoading,
    payeeList,
    categoryOptions,
    autofillForPayee,
    transferKeepsCategory,
    isLoading,
    cycleCleared,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    isSaving: createMutation.isPending,
    isSavingEdit: updateMutation.isPending || deleteMutation.isPending,

    // The API writes these for a reader ("Delete it and enter it again."), so
    // they are shown as they arrive. Without the create one a refused entry
    // just vanished, which is how a register loses a transaction quietly.
    createError: createMutation.error?.message ?? null,
    updateError: updateMutation.error?.message ?? null,
    deleteError: deleteMutation.error?.message ?? null,

    /** Drop a stale error, for when the register moves to a different row. */
    resetStatus: () => {
      updateMutation.reset();
      deleteMutation.reset();
    },

    /** The same, for the add row, which clears itself on a successful save. */
    resetCreateStatus: () => createMutation.reset(),
  };
}
