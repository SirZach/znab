import { createFileRoute } from "@tanstack/react-router";
import { accountRegisterSearchSchema } from "@znab/shared";
import { trpc } from "@/trpc";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { CheckCircle2, Circle, Lock, CalendarIcon } from "lucide-react";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export const Route = createFileRoute(
  "/budgets/$budgetId/accounts/$accountId"
)({
  validateSearch: accountRegisterSearchSchema,
  component: AccountRegisterPage,
});

const today = new Date();
const currentMonthFirstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

const colgroup = (
  <colgroup>
    <col className="w-28" />
    <col />
    <col />
    <col />
    <col className="w-24" />
    <col className="w-24" />
    <col className="w-10" />
    <col className="w-28" />
  </colgroup>
);

function AccountRegisterPage() {
  const { budgetId, accountId } = Route.useParams();
  const { cleared, q } = Route.useSearch();

  const { data: transactions, isLoading } = trpc.account.transactions.useQuery({
    budgetId: Number(budgetId),
    accountId: Number(accountId),
    cleared: cleared as "all" | "Uncleared" | "Cleared" | "Reconciled",
    q,
  });

  const utils = trpc.useUtils();
  const setClearedMutation = trpc.transaction.setClearedStatus.useMutation({
    onSuccess: () => utils.account.transactions.invalidate(),
  });

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: () => {
      utils.account.transactions.invalidate();
      setDate(new Date());
      setPayeeId(null);
      setPayeeName("");
      setCategoryId(null);
      setMemo("");
      setOutflow("");
      setInflow("");
    },
  });

  const { data: accounts } = trpc.account.list.useQuery({ budgetId: Number(budgetId) });
  const account = accounts?.find((a) => a.id === Number(accountId));

  const { data: monthData } = trpc.budget.monthData.useQuery({
    budgetId: Number(budgetId),
    month: currentMonthFirstDay,
  });

  const { data: payeeList } = trpc.payee.list.useQuery({ budgetId: Number(budgetId) });

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [payeeId, setPayeeId] = useState<number | null>(null);
  const [payeeName, setPayeeName] = useState("");
  const [payeeOpen, setPayeeOpen] = useState(false);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [outflow, setOutflow] = useState("");
  const [inflow, setInflow] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading transactions…</p>
      </div>
    );
  }

  let running = 0;
  const withBalance = (transactions ?? []).map((t) => {
    running += parseFloat(t.amount);
    return { ...t, runningBalance: running };
  });

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

  function handleSave() {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const outflowVal = parseFloat(outflow);
    const inflowVal = parseFloat(inflow);
    const hasOutflow = !isNaN(outflowVal) && outflowVal > 0;
    const hasInflow = !isNaN(inflowVal) && inflowVal > 0;
    if (!hasOutflow && !hasInflow) return;
    if (hasOutflow && hasInflow) return;

    const amount = hasInflow ? inflowVal : -outflowVal;

    createMutation.mutate({
      budgetId: Number(budgetId),
      accountId: Number(accountId),
      payeeId: payeeId,
      payeeName: payeeId ? undefined : (payeeName || undefined),
      categoryId: categoryId,
      amount,
      date: dateStr,
      memo: memo || undefined,
      cleared: "Uncleared",
      accepted: true,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
  }

  const inputClass =
    "bg-transparent border-b border-border focus:outline-none focus:border-primary text-sm w-full px-1 py-0.5";

  const categoryOptions = monthData
    ?.filter((g) => !g.isSystem)
    .flatMap((g) => g.categories.map((c) => ({ id: c.id, label: `${g.name}: ${c.name}` }))) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-xl font-semibold">{account?.name ?? "Account"}</h2>
          <p className="text-sm text-muted-foreground capitalize">{account?.accountType}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Current balance</p>
          <p className="text-lg font-semibold">
            {withBalance.length > 0
              ? formatCurrency(withBalance[withBalance.length - 1]!.runningBalance)
              : "$0.00"}
          </p>
        </div>
      </div>

      {/* Sticky table header */}
      <table className="w-full text-sm border-b border-border">
        {colgroup}
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left px-6 py-2 font-medium">Date</th>
            <th className="text-left px-4 py-2 font-medium">Payee</th>
            <th className="text-left px-4 py-2 font-medium">Category</th>
            <th className="text-left px-4 py-2 font-medium">Memo</th>
            <th className="text-right px-4 py-2 font-medium">Outflow</th>
            <th className="text-right px-4 py-2 font-medium">Inflow</th>
            <th className="text-center px-2 py-2 font-medium">C</th>
            <th className="text-right px-6 py-2 font-medium">Balance</th>
          </tr>
        </thead>
      </table>

      {/* Scrollable transaction rows */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-sm">
          {colgroup}
          <tbody>
            {withBalance.map((txn) => {
              const amount = parseFloat(txn.amount);
              const isInflow = amount > 0;

              return (
                <tr
                  key={txn.id}
                  className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-6 py-2 text-muted-foreground tabular-nums">
                    {formatDate(txn.date)}
                  </td>
                  <td className="px-4 py-2">{txn.payee?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {txn.isSplit
                      ? "Split"
                      : txn.category?.name ?? txn.categoryYnabId?.split("/").pop() ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-48">
                    {txn.memo ?? ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {!isInflow ? formatCurrency(Math.abs(amount)) : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-500">
                    {isInflow ? formatCurrency(amount) : ""}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => cycleCleared(txn.cleared, txn.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={txn.cleared}
                    >
                      {txn.cleared === "Reconciled" ? (
                        <Lock size={14} className="text-primary" />
                      ) : txn.cleared === "Cleared" ? (
                        <CheckCircle2 size={14} className="text-green-500" />
                      ) : (
                        <Circle size={14} />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-2 text-right tabular-nums font-medium">
                    {formatCurrency(txn.runningBalance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {withBalance.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">No transactions found.</p>
          </div>
        )}
      </div>

      {/* Sticky add transaction row */}
      <table className="w-full text-sm border-t border-border bg-accent/20">
        {colgroup}
        <tbody>
          <tr>
            <td className="px-6 py-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    tabIndex={1}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-50" />
                    {date ? format(date, "MM/dd/yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </td>
            <td className="px-4 py-2">
              <Popover open={payeeOpen} onOpenChange={setPayeeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    tabIndex={2}
                    variant="ghost"
                    role="combobox"
                    className="w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1 text-foreground"
                  >
                    {payeeId
                      ? payeeList?.find((p) => p.id === payeeId)?.name
                      : payeeName || <span className="text-muted-foreground">Payee</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search payees..."
                      value={payeeName}
                      onValueChange={(val) => { setPayeeName(val); setPayeeId(null); }}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {payeeName ? `Add "${payeeName}"` : "No payees found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {payeeList?.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            onSelect={() => {
                              setPayeeId(p.id);
                              setPayeeName(p.name);
                              setPayeeOpen(false);
                              setTimeout(() => categoryTriggerRef.current?.focus(), 0);
                            }}
                          >
                            {p.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </td>
            <td className="px-4 py-2">
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    ref={categoryTriggerRef}
                    tabIndex={3}
                    variant="ghost"
                    role="combobox"
                    onFocus={() => setCategoryOpen(true)}
                    className="w-full justify-start text-left text-sm font-normal h-auto py-0.5 px-1 text-foreground"
                  >
                    {categoryId
                      ? categoryOptions.find((c) => c.id === categoryId)?.label
                      : <span className="text-muted-foreground">Category</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandList>
                      <CommandEmpty>No categories found.</CommandEmpty>
                      <CommandGroup>
                        {categoryOptions.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.label}
                            onSelect={() => {
                              setCategoryId(c.id);
                              setCategoryOpen(false);
                              setTimeout(() => memoRef.current?.focus(), 0);
                            }}
                          >
                            {c.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </td>
            <td className="px-4 py-2">
              <input
                type="text"
                ref={memoRef}
                tabIndex={4}
                placeholder="Memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onKeyDown={handleKeyDown}
                className={inputClass}
              />
            </td>
            <td className="px-4 py-2">
              <input
                tabIndex={5}
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={outflow}
                onChange={(e) => setOutflow(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`${inputClass} text-right`}
              />
            </td>
            <td className="px-4 py-2">
              <input
                tabIndex={6}
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={inflow}
                onChange={(e) => setInflow(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`${inputClass} text-right`}
              />
            </td>
            <td className="px-2 py-2" />
            <td className="px-6 py-2 text-right">
              <button
                onClick={handleSave}
                disabled={createMutation.isPending}
                className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
