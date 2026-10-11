# Chunk A: API routers, index.ts, trpc.ts, context.ts

The routers are careful and well commented, and the pure maths (budget-math, schedule, reconcile, transfer naming) already lives in lib with tests. The main debt is duplication *between* routers. The transfer-pair write is copy-pasted in two routers. The payee find-or-create logic appears six times. The register's on-budget money union is written out five times across `budget.ts` and `report.ts`. About 45 procedures repeat the same `budgetId` input and `assertBudgetAccess` boilerplate, and a few skip it in favour of ad hoc checks that throw the wrong error. No router has a test. Every write path that touches more than one table (transfers, opening balance, reconcile, merge, enterDue) is covered only indirectly by the lib unit tests. `index.ts`, `trpc.ts` and `context.ts` are small and fine.

## High

### Transfer pair write duplicated across two routers
`routers/transaction.ts:125-231`, `routers/scheduled-transaction.ts:271-365`
Both places run the same steps: resolve near and far accounts, find or create the back payee, mint two linked ynab ids, and insert both sides with `transferCategoryId`. The copies already differ in small ways: `cleared` and `flagColor` on the near side, and `amount` is a number in one and a string in the other. A fix to one copy will silently miss the other. Extract `writeTransferPair(tx, { budgetId, nearAccountId, payee, amount, date, memo, categoryId, nearCleared, extra })` into `lib/transfer.ts` (or a new `lib/transactions-write.ts`) and call it from both routers.

### No router tests; multi-table write logic is untested
`routers/*.ts` (no `*.test.ts` touches any router)
These have no coverage: the opening-balance flow in `account.create` (`account.ts:425-563`), the reconcile sweep (`account.ts:847-1005`), transfer create and update mirroring (`transaction.ts:158-231, 336-390`), `payee.merge` (`payee.ts:240-318`), `scheduledTransaction.enterDue` savepoint handling (`scheduled-transaction.ts:661-710`), and the register paging and reversal (`account.ts:198-321`). Add DB-backed integration tests that call `appRouter.createCaller(ctx)` inside a rolled-back transaction, matching the repo's existing verification convention. Start with transfers, reconcile and merge.

## Medium

### Payee find-or-create repeated six times with inconsistent matching
`account.ts:523-543`, `account.ts:932-951`, `transaction.ts:94-105`, `transaction.ts:323-334`, `scheduled-transaction.ts:480-491`, `scheduled-transaction.ts:539-550`
The two account copies match existing payees case-insensitively and trimmed. The four on-the-fly copies always insert a new payee with an untrimmed `payeeName`, so typing an existing name creates a duplicate (the very thing `payee.rename` refuses at `payee.ts:185-203`). Add `findOrCreatePayee(tx, budgetId, name, opts)` in lib and use it everywhere. Add a `mintPayeeYnabId()` next to `mintCategoryYnabId` in `lib/category.ts`.

### transaction.create writes outside a transaction on the non-transfer path
`transaction.ts:94-105`, `transaction.ts:234-252`
The on-the-fly payee is inserted before, and outside, the db transaction. That holds for both paths. If the transaction insert then fails, an orphan payee is left behind. `scheduledTransaction.create` does this correctly (`scheduled-transaction.ts:472-491`). Wrap the whole mutation in `ctx.db.transaction` as the scheduled router does.

### Spending and money source SQL written out five times
`budget.ts:52-78`, `budget.ts:99-123`, `report.ts:66-92`, `report.ts:137-165`, `report.ts:237-261`
Each copy is a transactions UNION ALL sub_transactions over live on-budget accounts, with small variations. The budget engine includes transfers that carry a category and the reports exclude them (`t.is_transfer = false`), so Spent on the budget page and Spending by Category can disagree for a categorised transfer to a tracking account. Build one `onBudgetMoneySource(budgetId, { since, excludeTransfers })` SQL fragment in lib, and decide deliberately whether transfers count.

### Hardcoded constants that already exist in lib
`budget.ts:55` hardcodes `('CreditCard', 'OtherLiability')`, which is `CREDIT_ACCOUNT_TYPES` in `lib/account.ts:30`. `report.ts:43` hardcodes the two income ynab ids, which are `IMMEDIATE_INCOME`/`DEFERRED_INCOME` in `lib/budget-math.ts:6-7`. Interpolate the lib constants into the SQL so the classification cannot drift.

### Budget access check boilerplate in about 45 procedures, with ad hoc variants
`budgetId: z.number().int().positive()` plus `await assertBudgetAccess(ctx, input.budgetId)` is repeated in every budget-scoped procedure (12 in budget.ts, 10 in category.ts, 9 in account.ts, 8 in payee.ts). Four places hand-roll the check instead: `budget.ts:149-156`, `budget.ts:240-242,265`, `report.ts:305-308`, `transaction.ts:81-84`. Three of them throw a plain `Error`, which tRPC reports as INTERNAL_SERVER_ERROR rather than NOT_FOUND. Add a `budgetProcedure` in `trpc.ts` that declares `z.object({ budgetId })` as base input and runs `assertBudgetAccess` in middleware (putting `budget` on ctx). Then delete the hand-rolled checks. `budget.byId` becomes `({ ctx }) => ctx.budget`.

### loadBudgetInputs is data access living in a router, imported by another router
`budget.ts:52-134`, `household-split.ts:9`
`household-split.ts` imports from `./budget`, which creates a router-to-router dependency. Move `categoryActivitySource` and `loadBudgetInputs` to `lib/budget-queries.ts` (next to `budget-math.ts`). Both routers then depend on lib.

### Account reorder validation duplicates category's assertExactly; reorders issue N updates
`account.ts:729-740` re-implements `assertExactly` from `category.ts:45-57`. `account.ts:745-750`, `category.ts:435-445` and `category.ts:599-609` each issue one UPDATE per row. Move `assertExactly` to lib and reuse it. Replace each loop with a single `UPDATE ... FROM (SELECT unnest($ids) WITH ORDINALITY)` statement, or a shared `reorderRows(tx, table, ids)` helper.

### reconcile re-implements lockAccount inline
`account.ts:854-873` vs `account.ts:55-82`
The only difference is the extra `lastReconciledDate` column. Add the column to `lockAccount`'s select and call it, which removes about 20 lines.

### enterDue repeats per-occurrence lookups and swallows unexpected errors
`scheduled-transaction.ts:686-687`, `scheduled-transaction.ts:700-706`
`enterOccurrence` re-reads the account, payee, both transfer ends and the back payee for every due date: up to 60 dates times 5 queries for each schedule. Resolve those once per schedule and pass them in. Non-TRPC errors are also turned into "This one could not be entered." with no logging, which hides real bugs. Log the error (`console.error`) before pushing it to `skipped`.

### category.list usage count scans every budget's tables
`category.ts:175-189`
The four `GROUP BY category_id` subqueries have no `budget_id` filter, so each call counts every category in every budget. Filter `transactions`, `monthly_budgets` and `scheduled_transactions` by `budget_id`, and join `sub_transactions` to its parent's `budget_id` (or restrict by `category_id IN (SELECT id FROM categories WHERE budget_id = ...)`).

### Payee writes skip the lock and check-then-write pattern the other routers use
`payee.ts:174-212`, `payee.ts:332-398`, `payee.ts:415-453`
`account.ts` and `category.ts` read the row with `FOR UPDATE` inside the transaction and then write. `payee.rename`, `delete` and `setAutofill` check outside any transaction and write afterwards. In `delete`, the reference count runs outside the transaction that soft deletes. Add a `lockPayee(tx, ...)` like `lockAccount`/`lockCategory`, and run each mutation in one transaction.

## Low

### Unused procedure budget.monthData
`budget.ts:179-222`
No web code queries it; `apps/web/src/hooks/useCategories.ts:23` only invalidates it. Delete the procedure and the invalidate call.

### Tx type declared three ways
`account.ts:38`, `category.ts:12`, `scheduled-transaction.ts:24` (and `scripts/import-yfull.ts:33`)
Export one `Tx` type from `packages/db` (or `lib/authz.ts`) and import it.

### today() computed in UTC, four times
`account.ts:407`, `account.ts:555`, `account.ts:878`, `scheduled-transaction.ts:38-40`
`toISOString().slice(0,10)` returns the UTC date, so after about 5pm Pacific "today" is already tomorrow, while `report.ts:404-412` uses local time. Add one `today()` in lib that uses a single, consistent zone and use it everywhere.

### Repeated input schema fragments
The ISO date regex `/^\d{4}-\d{2}-\d{2}$/` appears 10 times in routers (`budget.ts:184,233,378,405,468,505,547,594`, `account.ts:394`, `household-split.ts:142`). Name trimming and the empty check are hand-written in `account.ts:415-418,582-585`, `payee.ts:177-180,470-473` and `category.ts:15-21`. Export `isoDateSchema`, `monthStartSchema` and a `nameSchema = z.string().trim().min(1).max(200)` from `@znab/shared`, and drop the manual trims.

### Split payee and category id checks duplicate assertIdsInBudget
`budget.ts:31-43` (`assertCategoryInBudget`), `payee.ts:22-34` (`assertPayeeInBudget`), `payee.ts:421-433` (inline category check), `scheduled-transaction.ts:111-132` (payee re-read)
These all re-implement `lib/authz.ts:assertIdsInBudget`. Have `assertIdsInBudget` return the rows it found, with optional column and deleted-filter options, and reuse it.

### The MonthlyBudget upsert is written three times
`budget.ts:357-369`, `budget.ts:444-456`, `budget.ts:480-493`
Each copy builds the same `MCB/${month}/${categoryId}` ynab id and the same `onConflictDoUpdate` target. Extract `upsertMonthlyBudget(db, { budgetId, categoryId, month, set })`.

### Pure computation sitting in router bodies
`report.ts:333-383` (net worth walk), `report.ts:387-412` (`monthRange`, `timeframeCutoff`), `budget.ts:557-582` (`categoryHistory` series), `household-split.ts:44-49` (master total)
These are pure and untested. Move them to lib (`report-math.ts`, `budget-math.ts`) with unit tests. `monthRange` duplicates `monthIndex`/`monthFromIndex` from `lib/budget-math.ts:58-63`.

### Pluralisation hand-rolled six times
`account.ts:604,776-778,798-800`, `category.ts:309-313,551-553`, `payee.ts:366-368`
Add a `plural(n, "transaction")` helper.

### Independent queries run sequentially
`account.ts:116-133` (accounts and totals), `account.ts:213-257` (page and totals), `payee.ts:95-139` (payees and rules)
None of these depend on each other. Wrap each pair in `Promise.all`, as `category.list` and `budget.monthBudget` already do.

### Every month view and inspector reloads the full budget history
`budget.ts:254`, `budget.ts:385`, `budget.ts:555`, `household-split.ts:29`
Each call scans every transaction in the budget. `categoryHistory` throws away the income series it loaded and keeps one category. This is acceptable at about 19k rows, but it adds up: `householdSplit.month` runs it twice. As a first step, let `categoryHistory` query only its own category's rows.

### ownedBudgetIds subselect stacked on already scoped writes
For example `account.ts:651,695,749,821,995` and `category.ts:263,336,382,442`. Each runs after `assertBudgetAccess` plus a `lockX` that already scoped the row by owned budget. The subselect is deliberate defence in depth, but `payee.ts` and `household-split.ts` scope by `eq(budgetId)` instead. Pick one convention and document it in `lib/authz.ts`.
