import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { trpc, type HouseholdSplitOutputs } from "@/trpc";
import { useUserStore } from "@/store/user";
import {
  currentMonthParam,
  dateToMonthParam,
  formatCurrency,
  monthParamToDate,
  cn,
} from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/budgets/balancing")({
  validateSearch: budgetSearchSchema,
  // Same guard as the budget list: read the store, not route context.
  beforeLoad: () => {
    if (!useUserStore.getState().userSlug) {
      throw redirect({ to: "/" });
    }
  },
  component: BalancingPage,
});

function BalancingPage() {
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
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-4">
        <Link to="/budgets" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Budgets
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Household Balancing</CardTitle>
            <CardAction className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous month"
                onClick={() => go(subMonths(currentDate, 1))}
              >
                <ChevronLeft />
              </Button>
              <span className="w-32 text-center text-sm font-medium">
                {format(currentDate, "MMMM yyyy")}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next month"
                onClick={() => go(addMonths(currentDate, 1))}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Household balancing settings"
                aria-expanded={showSettings}
                onClick={() => setShowSettings((s) => !s)}
                className={cn("ml-2", showSettings && "bg-accent text-accent-foreground")}
              >
                <Settings />
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent className="gap-4">
            {split?.configured && <SplitTable split={split} />}

            {settings && split && (showSettings || !configured) && (
              <SplitSettings
                // Remounting on a saved change starts the form from what was saved.
                key={`${settings.primaryBudgetId}-${settings.partnerBudgetId}-${settings.savingsPercent}`}
                settings={settings}
                prompt={!configured}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead className="text-right">Income</TableHead>
            <TableHead className="text-right">Master Budgets</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[split.primary, split.partner].map((p) => (
            <TableRow key={p.budgetId}>
              <TableCell>{p.name}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(p.income)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(p.master)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(split.incomeTotal)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(split.masterTotal)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

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
  const [primaryId, setPrimaryId] = useState<number | null>(settings.primaryBudgetId);
  const [partnerId, setPartnerId] = useState<number | null>(settings.partnerBudgetId);
  const [percent, setPercent] = useState(String(settings.savingsPercent));

  const onSuccess = () =>
    Promise.all([utils.householdSplit.settings.invalidate(), utils.householdSplit.month.invalidate()]);
  const update = trpc.householdSplit.updateSettings.useMutation({ onSuccess });
  const setFlag = trpc.householdSplit.setGroupFlag.useMutation({ onSuccess });

  const percentValue = Number(percent);
  const canSave =
    primaryId !== null &&
    partnerId !== null &&
    primaryId !== partnerId &&
    percent.trim() !== "" &&
    percentValue >= 0 &&
    percentValue <= 100;

  // Given to Select so the trigger shows the chosen budget's name, not its id.
  const budgetItems = settings.budgets.map((b) => ({ value: b.id, label: b.name }));

  const budgetSelect = (
    id: string,
    label: string,
    value: number | null,
    onChange: (v: number | null) => void
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <Select items={budgetItems} value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose a budget..." />
        </SelectTrigger>
        <SelectContent>
          {budgetItems.map((b) => (
            <SelectItem key={b.value} value={b.value}>
              {b.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
        {budgetSelect("primary-budget", "Primary budget", primaryId, setPrimaryId)}
        {budgetSelect("partner-budget", "Partner budget", partnerId, setPartnerId)}
        <div className="space-y-1.5">
          <Label htmlFor="savings-percent" className="text-muted-foreground">
            Savings percent
          </Label>
          <Input
            id="savings-percent"
            type="number"
            min={0}
            max={100}
            step="any"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className="text-right tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {update.error && <p className="text-xs text-destructive">{update.error.message}</p>}
        <Button
          size="sm"
          disabled={!canSave || update.isPending}
          onClick={() =>
            update.mutate({
              primaryBudgetId: Number(primaryId),
              partnerBudgetId: Number(partnerId),
              savingsPercent: percentValue,
            })
          }
        >
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {chosen.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {chosen.map((b) => (
            <fieldset key={b.id} className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{b.name} master budgets</legend>
              {b.groups.map((g) => (
                <Label key={g.id} className="font-normal cursor-pointer">
                  <Checkbox
                    checked={g.inMasterBudgets}
                    disabled={setFlag.isPending}
                    onCheckedChange={(checked) =>
                      setFlag.mutate({ budgetId: b.id, groupId: g.id, inMasterBudgets: checked })
                    }
                  />
                  {g.name}
                </Label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}
