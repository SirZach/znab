/**
 * A budget's transactions as CSV, laid out the way YNAB 4's register export
 * is: one line per transaction, and a split spread over one line per part.
 */
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { DEFERRED_INCOME, IMMEDIATE_INCOME, toCents } from "@znab/shared";
import { userFromRequest } from "../context";
import { assertBudgetAccess, type AuthedContext } from "./authz";
import { localToday } from "./date";

export type CsvTransactionRow = {
  account: string;
  date: string;
  payee: string | null;
  categoryGroup: string | null;
  category: string | null;
  categoryYnabId: string | null;
  memo: string | null;
  amount: string;
  cleared: string;
  flag: string | null;
  /** This line's place in its split, and how many parts the split has; 0 for none. */
  splitIndex: number;
  splitCount: number;
};

const HEADER = [
  "Account",
  "Date",
  "Payee",
  "Category Group",
  "Category",
  "Memo",
  "Outflow",
  "Inflow",
  "Cleared",
  "Flag",
];

// The labels the register's category picker gives income, which has no
// category row of its own (see web/src/lib/category-options.ts).
const INCOME_LABELS: Record<string, string> = {
  [IMMEDIATE_INCOME]: "Income for this month",
  [DEFERRED_INCOME]: "Income for next month",
};

// YNAB 4's register export writes the cleared state as one letter.
const CLEARED_LETTER: Record<string, string> = { Uncleared: "U", Cleared: "C", Reconciled: "R" };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Whole cents as the app shows money: $1,234.56. */
export function formatMoney(cents: number): string {
  return usd.format(cents / 100);
}

/**
 * One field, quoted when it has to be. A field a spreadsheet would read as a
 * formula (leading `=`, `+`, `-`, `@`, tab or carriage return) is defused with
 * a leading apostrophe first: payee names and memos are typed by people and
 * come back out of here into Excel.
 */
export function csvField(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The register export's line for one row. Money is split into outflow and inflow, both positive. */
export function csvLine(row: CsvTransactionRow): string {
  const cents = toCents(row.amount);
  const income = row.categoryYnabId ? INCOME_LABELS[row.categoryYnabId] : undefined;
  const memo =
    row.splitCount > 0
      ? `(Split ${row.splitIndex}/${row.splitCount}) ${row.memo ?? ""}`.trimEnd()
      : row.memo;
  return [
    row.account,
    row.date,
    row.payee,
    income ? "Income" : row.categoryGroup,
    income ?? row.category,
    memo,
    formatMoney(cents < 0 ? -cents : 0),
    formatMoney(cents > 0 ? cents : 0),
    CLEARED_LETTER[row.cleared] ?? row.cleared,
    row.flag,
  ]
    .map(csvField)
    .join(",");
}

/** The whole file: a header and one CRLF-terminated line per row, as RFC 4180 has it. */
export function transactionsCsv(rows: CsvTransactionRow[]): string {
  return [HEADER.join(","), ...rows.map(csvLine)].map((l) => `${l}\r\n`).join("");
}

/**
 * Every live transaction in the budget, oldest first, with a split's parts in
 * place of the split. Closed accounts are included: their history is still
 * the budget's. A split whose parts are all gone stands as its own line.
 */
export async function loadCsvRows(db: AuthedContext["db"], budgetId: number) {
  return (await db.execute(sql`
    SELECT
      a.name AS account,
      to_char(t.date, 'YYYY-MM-DD') AS date,
      p.name AS payee,
      g.name AS "categoryGroup",
      c.name AS category,
      CASE WHEN s.id IS NULL THEN t.category_ynab_id ELSE s.category_ynab_id END AS "categoryYnabId",
      CASE WHEN s.id IS NULL THEN t.memo ELSE s.memo END AS memo,
      CASE WHEN s.id IS NULL THEN t.amount ELSE s.amount END AS amount,
      t.cleared,
      t.flag_color AS flag,
      CASE WHEN s.id IS NULL THEN 0
        ELSE (ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY s.id))::int END AS "splitIndex",
      CASE WHEN s.id IS NULL THEN 0
        ELSE (COUNT(*) OVER (PARTITION BY t.id))::int END AS "splitCount"
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN sub_transactions s
      ON t.is_split AND s.transaction_id = t.id AND s.deleted_at IS NULL
    -- A part is paid like its parent, unless it names a payee of its own (a
    -- transfer inside a split).
    LEFT JOIN payees p ON p.id = COALESCE(s.payee_id, t.payee_id)
    LEFT JOIN categories c
      ON c.id = CASE WHEN s.id IS NULL THEN t.category_id ELSE s.category_id END
    LEFT JOIN category_groups g ON g.id = c.group_id
    WHERE t.budget_id = ${budgetId}
      AND t.deleted_at IS NULL
      AND a.deleted_at IS NULL
    ORDER BY t.date, t.id, s.id
  `)) as unknown as CsvTransactionRow[];
}

/**
 * The download behind GET /export/:budgetId/transactions.csv. Identity is the
 * x-user-slug header the tRPC client sends, and the budget is checked the way
 * `budgetProcedure` checks it, so a budget belonging to someone else is a 404
 * here as it is there. A browser link cannot carry the header, so the web app
 * fetches this and saves the blob.
 */
export async function exportTransactionsCsv(
  db: AuthedContext["db"],
  req: Request,
  budgetIdParam: string
): Promise<Response> {
  const user = await userFromRequest(req, db);
  if (!user) return Response.json({ error: "No user selected" }, { status: 401 });

  const budgetId = Number(budgetIdParam);
  if (!Number.isSafeInteger(budgetId) || budgetId <= 0) {
    return Response.json({ error: "Budget not found" }, { status: 404 });
  }

  let budget: Awaited<ReturnType<typeof assertBudgetAccess>>;
  try {
    budget = await assertBudgetAccess({ db, user, req }, budgetId);
  } catch (error) {
    if (error instanceof TRPCError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }

  const name = budget.name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "budget";
  return new Response(transactionsCsv(await loadCsvRows(db, budget.id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-transactions-${localToday()}.csv"`,
    },
  });
}
