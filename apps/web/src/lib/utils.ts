import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a NUMERIC string from the DB as a dollar amount */
export function formatCurrency(amount: string | number | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/** Convert "MM/YYYY" (URL param) to "YYYY-MM-01" (DB date) */
export function monthParamToDate(month: string): string {
  const [mm, yyyy] = month.split("/");
  return `${yyyy}-${mm}-01`;
}

/** Convert "YYYY-MM-01" (DB date) to "MM/YYYY" (URL param) */
export function dateToMonthParam(date: string): string {
  const [yyyy, mm] = date.split("-");
  return `${mm}/${yyyy}`;
}

/** Get current month as "MM/YYYY" */
export function currentMonthParam(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${mm}/${yyyy}`;
}

/** Format a date string "YYYY-MM-DD" for display */
export function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
