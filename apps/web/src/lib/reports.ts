import { BarChart2, Landmark, Store, TrendingUp } from "lucide-react";
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
