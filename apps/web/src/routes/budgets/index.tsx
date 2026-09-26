import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { trpc, type HouseholdSplitOutputs } from "@/trpc";
import { useBudgetList } from "@/hooks/useBudgetList";
import { useUserStore } from "@/store/user";
import {
  currentMonthParam,
  dateToMonthParam,
  formatCurrency,
  monthParamToDate,
  cn,
} from "@/lib/utils";

export const Route = createFileRoute("/budgets/")({
  validateSearch: budgetSearchSchema,
  // Read the store, not route context: the root route's guard reads the same
  // value, and a stale context here would bounce the two guards against each
  // other right after the user is selected or cleared.
  beforeLoad: () => {
    if (!useUserStore.getState().userSlug) {
      throw redirect({ to: "/" });
    }
  },
  component: BudgetListPage,
});

function BudgetListPage() {
  const { budgets, isLoading } = useBudgetList();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading budgets…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <HouseholdSplit />

        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">Your Budgets</h1>
          <p className="text-muted-foreground">Select a budget to open it.</p>
        </div>

        <div className="grid gap-3">
          {budgets?.map((budget) => (
            <Link
              key={budget.id}
              to="/budgets/$budgetId"
              params={{ budgetId: String(budget.id) }}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary hover:bg-accent"
            >
              <span className="font-medium text-card-foreground">{budget.name}</span>
              <span className="text-muted-foreground text-sm">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Household split ─────────────────────────────────────────────────────────

const fieldClass =
  "rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function HouseholdSplit() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const month = search.month ?? currentMonthParam();
  const dbMonth = monthParamToDate(month);

  const { data: settings } = trpc.householdSplit.settings.useQuery();
  const { data: split } = trpc.householdSplit.month.useQuery({ month: dbMonth });
  const [showSettings, setShowSettings] = useState(false);

  const currentDate = parseISO(dbMonth);
  const go = (date: Date) =>
    navigate({ search: { month: dateToMonthParam(format(date, "yyyy-MM-01")) } });
  const configured = split?.configured ?? false;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-card-foreground">Household Split</h2>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            onClick={() => go(subMonths(currentDate, 1))}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="w-32 text-center text-sm font-medium">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <button
            aria-label="Next month"
            onClick={() => go(addMonths(currentDate, 1))}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <ChevronRight size={20} />
          </button>
          <button
            aria-label="Household split settings"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((s) => !s)}
            className={cn(
              "ml-2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground",
              showSettings && "bg-accent text-foreground"
            )}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {split?.configured && <SplitTable split={split} />}

      {settings && split && (showSettings || !configured) && (
        <SplitSettings
          // Remounting on a saved change starts the form from what was saved.
          key={`${settings.primaryBudgetId}-${settings.partnerBudgetId}-${settings.savingsPercent}`}
          settings={settings}
          prompt={!configured}
        />
      )}
    </section>
  );
}

type MonthSplit = Extract<HouseholdSplitOutputs["month"], { configured: true }>;

function SplitTable({ split }: { split: MonthSplit }) {
  const summary: [string, number][] = [
    ["Amount Left Over", split.leftOver],
    [`Saving (${split.savingsPercent}%)`, split.saving],
    [`${split.primary.name} Amount Left Over`, split.primaryLeftOver],
    [`${split.partner.name} Amount Left Over`, split.partnerLeftOver],
  ];

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-muted-foreground">
            <th className="py-2 text-left font-medium" />
            <th className="py-2 text-right font-medium">Income</th>
            <th className="py-2 text-right font-medium">Master Budgets</th>
          </tr>
        </thead>
        <tbody>
          {[split.primary, split.partner].map((p) => (
            <tr key={p.budgetId} className="border-b border-border">
              <td className="py-2">
                {p.name}
                <span className="block text-xs text-muted-foreground">
                  {p.groups.length ? p.groups.join(", ") : "No master budget groups"}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(p.income)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(p.master)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(split.incomeTotal)}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(split.masterTotal)}</td>
          </tr>
        </tbody>
      </table>

      <dl className="space-y-1 text-sm">
        {summary.map(([label, amount]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("tabular-nums font-medium", amount < 0 && "text-destructive")}>
              {formatCurrency(amount)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SplitSettings({
  settings,
  prompt,
}: {
  settings: HouseholdSplitOutputs["settings"];
  prompt: boolean;
}) {
  const utils = trpc.useUtils();
  const [primaryId, setPrimaryId] = useState<number | "">(settings.primaryBudgetId ?? "");
  const [partnerId, setPartnerId] = useState<number | "">(settings.partnerBudgetId ?? "");
  const [percent, setPercent] = useState(String(settings.savingsPercent));

  const onSuccess = () =>
    Promise.all([utils.householdSplit.settings.invalidate(), utils.householdSplit.month.invalidate()]);
  const update = trpc.householdSplit.updateSettings.useMutation({ onSuccess });
  const setFlag = trpc.householdSplit.setGroupFlag.useMutation({ onSuccess });

  const percentValue = Number(percent);
  const canSave =
    primaryId !== "" &&
    partnerId !== "" &&
    primaryId !== partnerId &&
    percent.trim() !== "" &&
    percentValue >= 0 &&
    percentValue <= 100;

  const budgetSelect = (label: string, value: number | "", onChange: (v: number | "") => void) => (
    <label className="space-y-1 text-sm">
      <span className="block text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={cn(fieldClass, "w-full")}
      >
        <option value="">Choose a budget...</option>
        {settings.budgets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );

  const chosen = [primaryId, partnerId]
    .map((id) => settings.budgets.find((b) => b.id === id))
    .filter((b) => b !== undefined);

  return (
    <div className="space-y-4 border-t border-border pt-4">
      {prompt && (
        <p className="text-sm text-muted-foreground">
          Choose the two budgets to split and which of their groups count as master budgets.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {budgetSelect("Primary budget", primaryId, setPrimaryId)}
        {budgetSelect("Partner budget", partnerId, setPartnerId)}
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Savings percent</span>
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            aria-label="Savings percent"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className={cn(fieldClass, "w-full text-right tabular-nums")}
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        {update.error && <p className="text-xs text-destructive">{update.error.message}</p>}
        <button
          disabled={!canSave || update.isPending}
          onClick={() =>
            update.mutate({
              primaryBudgetId: Number(primaryId),
              partnerBudgetId: Number(partnerId),
              savingsPercent: percentValue,
            })
          }
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {update.isPending ? "Saving..." : "Save"}
        </button>
      </div>

      {chosen.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {chosen.map((b) => (
            <fieldset key={b.id} className="space-y-1">
              <legend className="mb-1 text-sm font-medium">{b.name} master budgets</legend>
              {b.groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.inMasterBudgets}
                    disabled={setFlag.isPending}
                    onChange={(e) =>
                      setFlag.mutate({
                        budgetId: b.id,
                        groupId: g.id,
                        inMasterBudgets: e.target.checked,
                      })
                    }
                  />
                  {g.name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}
