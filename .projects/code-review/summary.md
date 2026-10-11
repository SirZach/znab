# Code Review Summary

Totals: 18 High, 47 Medium, 44 Low across chunks A to E. Details and file anchors are in `findings/`. Items below are deduplicated and ranked; letters point to the chunk file.

## Real bugs found during review (fix first)
1. **UTC "today" on the API** (A, E). `new Date().toISOString().slice(0,10)` in `scheduled-transaction.ts:39` and `account.ts:407,555,878`. In US evenings `enterDue` enters tomorrow's schedules and future date checks disagree with the web. Verified.
2. **Stale data after writes** (D, E). Hand-written refresh lists per hook have drifted; register writes skip three of the four reports, quick budget, category history, `budget.months`, and household split. Verified in `useAccountRegister.ts:126`.
3. **Duplicate payees on the fly** (A). Four of six payee find-or-create copies skip trim and existing name lookup; `transaction.create` inserts the payee outside the db transaction.
4. **Spent vs Spending by Category mismatch** (A). On-budget SQL is repeated five times; budget page counts categorized transfers, reports do not.
5. **Plain `Error` for missing budget** (A). `budget.ts:155,265`, `report.ts:308` return 500 instead of NOT_FOUND.
6. **`category.list` usage count ignores `budget_id`** (A).
7. **All Accounts sort direction ignored** (C). Starts ascending, while `SortHeader` documents newest first.
8. **`RegisterSearch` keeps stale text and timer on account switch** (D).
9. **Split scheduled transactions silently dropped on import** (B).
10. **`lib/payee-rename.ts` never runs** (B). Rules are imported and editable but never applied.

## Architecture and duplication
- **Shared domain module** (B, D, E). Cents conversion has 6 to 8 copies with different NaN and null handling. `reconcileDifference` exists in api and web with opposite argument order. Credit account types, special category ids, transfer rule, goal types, timeframes are duplicated. Move to `packages/shared` (`money.ts`, `transfer.ts`, constants) carefully, fixing argument order.
- **Transfer pair write duplicated** (A). `transaction.ts:125-231` and `scheduled-transaction.ts:271-365` have drifted. Extract `writeTransferPair` into lib.
- **Budget access middleware** (A). About 45 procedures repeat the access boilerplate. Add a `budgetProcedure`.
- **Router to router import** (A). `loadBudgetInputs` lives in `routers/budget.ts`; move to lib.
- **Central invalidation** (D). One `lib/invalidate.ts` invalidating whole routers replaces five drifting lists.
- **Bulk actions fan out per row** (C). Add bulk endpoints.
- **Web imports API source by relative path** for types (E).

## Frontend composition
- **One component per file** (C, D). 8 of 14 route files and 8 component files define several components. Worst: `$accountId.tsx` (1004 lines), `$budgetId/index.tsx` (910), `category-inspector.tsx` (5 components). Split tables are in C and D.
- **Class name sprawl** (C, D). 77 raw `<button>` vs 34 `<Button>`, 28 raw `<input>`, 14 raw `<select>`. `NameInput` exists 3 times, `fieldClass` 4 times. Build `SidePanel`, `SidePanelSection`, `MoneyInput`, `SegmentedControl`, `ConfirmDialog`, an `xs` button size, and `--success`, `--warning`, `--chart-*` tokens.
- **Report components are near copies** (D). Extract `ReportLayout` and `lib/chart.ts`.
- **`useAccountRegister.ts` too big** (D). Split into `useRegisterPages` on `useInfiniteQuery`, `useRegisterWrites`, `useReconcile`. Its `pageCount` reset effect at `:67-70` fires throwaway requests.
- **useEffect misuse** (C). `BudgetedCell` copies a prop into state at `$budgetId/index.tsx:659`; derive it instead.
- **Logic stuck in routes** (C). Shift and ctrl row selection copied between budget grid and register, locked field rules, bulk eligibility, schedule draft mapping, group totals. Move to `lib/` and test.

## Database
- **No secondary indexes** (B). Composite uniques lead with `ynab_id`. Reorder to lead with `budget_id` or `transaction_id`, add `(account_id, date)` and `(budget_id, date)` on transactions.
- **No CHECK constraints** on enum-like text columns (B).
- **Dead columns** never written or never read (B).
- **`enterDue` N+1** (A). About 5 queries per due date; reorder runs one UPDATE per row.

## Tests and tooling
- **No router, import, hook, or component tests** (A, E). All 16 test files are lib unit tests. Setup: `appRouter.createCaller` against a `znab_test` db in a rolled-back transaction; `bun test` with happy-dom and Testing Library for web. The top 15 tests to write are listed in E.
- **No enforcement** (E). No `test`, `typecheck`, `lint` scripts; no linter. Add Biome and root `check` script.
- **Fresh clone web build fails** (E). `tsc` runs before Vite generates the gitignored `routeTree.gen.ts`. Commit it.
- **Hygiene** (E). `bun.lock` gitignored, `@types/bun` pinned to `latest`, unused deps (`@tanstack/react-form`, web `zod`, api `postgres`), stale README and SETUP, stray `znab_rebuild_plan.docx` and `.migration/`.

## Suggested fix phases
1. Tooling: root scripts, Biome, commit route tree and lockfile, remove unused deps.
2. Bugs 1 to 10 above, each with a test.
3. Router test harness, then shared money and domain module.
4. API extractions: `budgetProcedure`, `writeTransferPair`, payee find-or-create, on-budget SQL, indexes.
5. Frontend primitives (`SidePanel`, `MoneyInput`, etc.) and central invalidation.
6. File splits per route and component, `useAccountRegister` split, report layout.
