import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { budgetSearchSchema } from "@znab/shared";
import { format, addMonths, subMonths, parseISO } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { trpc } from "@/trpc";
import { requireUser } from "@/lib/require-user";
import { currentMonthParam, dateToMonthParam, monthParamToDate, cn } from "@/lib/utils";
import { SplitSettings } from "@/components/balancing/split-settings";
import { SplitTable } from "@/components/balancing/split-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/budgets/balancing")({
  validateSearch: budgetSearchSchema,
  beforeLoad: requireUser,
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
