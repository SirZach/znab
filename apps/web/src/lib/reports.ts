import { ArrowLeftRight, BarChart2, CalendarDays, Landmark, Scale, Store, TrendingUp } from "lucide-react";
import { AverageSpendingReport } from "@/components/reports/average-spending-report";
import { SpendingCalendarReport } from "@/components/reports/spending-calendar-report";
import { SpendingComparisonReport } from "@/components/reports/spending-comparison-report";
import { IncomeVsExpenseReport } from "@/components/reports/income-vs-expense-report";
import { NetWorthReport } from "@/components/reports/net-worth-report";
import { SpendingByCategoryReport } from "@/components/reports/spending-by-category-report";
import { SpendingByPayeeReport } from "@/components/reports/spending-by-payee-report";

/** Every report, in launcher order: the one list both the launcher and the report route read. */
export const REPORTS = [
  {
    id: "spending",
    label: "Spending by Category",
    description: "See where your money goes each month",
    icon: BarChart2,
    component: SpendingByCategoryReport,
  },
  {
    id: "spending-by-payee",
    label: "Spending by Payee",
    description: "See who your money goes to",
    icon: Store,
    component: SpendingByPayeeReport,
  },
  {
    id: "average-spending",
    label: "Average Monthly Spending",
    description: "See what a typical month costs in each category",
    icon: Scale,
    component: AverageSpendingReport,
  },
  {
    id: "spending-comparison",
    label: "Month over Month",
    description: "Compare a month or year of spending with the one before",
    icon: ArrowLeftRight,
    component: SpendingComparisonReport,
  },
  {
    id: "spending-calendar",
    label: "Spending Calendar",
    description: "See each day of a year's spending at a glance",
    icon: CalendarDays,
    component: SpendingCalendarReport,
  },
  {
    id: "income-vs-expenses",
    label: "Income vs. Expenses",
    description: "Compare income and outflow over time",
    icon: TrendingUp,
    component: IncomeVsExpenseReport,
  },
  {
    id: "net-worth",
    label: "Net Worth",
    description: "Track your net worth across all accounts",
    icon: Landmark,
    component: NetWorthReport,
  },
] as const;

export const findReport = (id: string) => REPORTS.find((report) => report.id === id);
