import React from "react";
import { format } from "date-fns";
import { trpc } from "@/trpc";

const today = new Date();
const currentMonthFirstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

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

  const { data: transactions, isLoading } = trpc.account.transactions.useQuery({
    budgetId,
    accountId,
    cleared,
    q,
  });

  const { data: accounts } = trpc.account.list.useQuery({ budgetId });
  const account = accounts?.find((a) => a.id === accountId);

  const { data: monthData } = trpc.budget.monthData.useQuery({
    budgetId,
    month: currentMonthFirstDay,
  });

  const { data: payeeList } = trpc.payee.list.useQuery({ budgetId });

  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: () => utils.account.transactions.invalidate(),
  });

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: (newTxn, variables) => {
      const resolvedPayee = variables.payeeId
        ? (payeeList?.find((p) => p.id === variables.payeeId) ?? null)
        : (variables.payeeName ? { id: newTxn.payeeId!, name: variables.payeeName } : null);

      const catOption = variables.categoryId
        ? categoryOptions.find((c) => c.id === variables.categoryId)
        : null;
      const resolvedCategory = catOption
        ? { id: catOption.id, name: catOption.label.split(": ")[1] ?? catOption.label }
        : null;

      const fullTxn = { ...newTxn, payee: resolvedPayee, category: resolvedCategory, subTransactions: [] };

      utils.account.transactions.setData(
        { budgetId, accountId, cleared, q },
        (old) => (old ? [...old, fullTxn] : [fullTxn]),
      );

      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 0);

      onSaveSuccess?.();
    },
  });

  let running = 0;
  const withBalance = (transactions ?? []).map((t) => {
    running += parseFloat(t.amount);
    return { ...t, runningBalance: running };
  });

  const categoryOptions = monthData
    ?.filter((g) => !g.isSystem)
    .flatMap((g) => g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))) ?? [];

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

  function createTransaction(fields: {
    date: Date | undefined;
    payeeId: number | null;
    payeeName: string;
    categoryId: number | null;
    memo: string;
    outflow: string;
    inflow: string;
  }) {
    if (!fields.date) return;
    const dateStr = format(fields.date, "yyyy-MM-dd");
    const outflowVal = parseFloat(fields.outflow);
    const inflowVal = parseFloat(fields.inflow);
    const hasOutflow = !isNaN(outflowVal) && outflowVal > 0;
    const hasInflow = !isNaN(inflowVal) && inflowVal > 0;
    if (!hasOutflow && !hasInflow) return;
    if (hasOutflow && hasInflow) return;

    const amount = hasInflow ? inflowVal : -outflowVal;

    createMutation.mutate({
      budgetId,
      accountId,
      payeeId: fields.payeeId,
      payeeName: fields.payeeId ? undefined : (fields.payeeName || undefined),
      categoryId: fields.categoryId,
      amount,
      date: dateStr,
      memo: fields.memo || undefined,
      cleared: "Uncleared",
      accepted: true,
    });
  }

  return {
    account,
    withBalance,
    payeeList,
    categoryOptions,
    isLoading,
    cycleCleared,
    createTransaction,
    isSaving: createMutation.isPending,
  };
}
