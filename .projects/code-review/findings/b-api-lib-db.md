# Chunk B: api lib, scripts, packages/db, packages/shared

The pure lib modules are in good shape: small, free of DB imports, and well tested (142 passing tests across 10 files). The main problems are around the edges. Money parsing is re-implemented in at least six places with different NaN behavior. YNAB vocabulary constants (income ids, credit account types, split id) live in three or more places each. One lib module (`payee-rename.ts`) is never called by the app. The schema has no secondary indexes and every unique key puts `ynab_id` first. The 674 line import script holds one 340 line function and has no tests. Several schema columns are written by the import and read by nothing, or not written at all.

## High

### No secondary indexes; every composite unique leads with `ynab_id`
- `packages/db/src/schema/transactions.ts:43,59`, `accounts.ts:27`, `categories.ts:27,51`, `payees.ts:26`, `monthly-budgets.ts:27`, `scheduled-transactions.ts:41`, `payee-rename-rules.ts:27`; no `CREATE INDEX` in any of `packages/db/migrations/*.sql`
- Every router query filters by `budget_id`, the register filters by `account_id` and date, and the activity SQL joins `sub_transactions` on `transaction_id` (`apps/api/src/routers/budget.ts:68-76`). None of these columns has an index: Postgres does not index foreign keys, and `unique(ynab_id, budget_id)` cannot serve a `budget_id`-only lookup.
- Fix: flip the uniques to `(budget_id, ynab_id)` and `(transaction_id, ynab_id)` so they also index the parent. Add `index().on(t.accountId, t.date)` on transactions and `index().on(t.budgetId, t.date)` for the month engine.

### `payee-rename.ts` is dead code in production
- `apps/api/src/lib/payee-rename.ts:22,63`. Only `payee-rename.test.ts` imports it.
- Rename rules get imported (`import-yfull.ts:309-340`) and edited in the payee router, but no code path calls `resolveRenamedPayee`. The 71 line module plus 122 lines of tests protect behavior the app never runs.
- Fix: wire it into whatever creates transactions from an imported payee string, or delete it with its test until that feature exists.

### Money parsing is duplicated, and the copies handle bad input differently
- `apps/api/src/lib/budget-math.ts:50`, `apps/api/src/lib/reconcile.ts:16`, `apps/api/src/lib/household-split.ts:18`, `apps/api/src/routers/budget.ts:567,631`, `apps/web/src/lib/reconcile.ts:23`, plus inline `Math.round(parseFloat(x) * 100)` in `routers/report.ts:109,179,182,284,338`
- `numeric(12,2)` comes back as a string, so each module writes its own cents helper. The web one maps NaN to 0, the api ones return NaN, and `budget-math` maps null to 0 while `reconcile` does not.
- Fix: put one `toCents(v: string | number | null): number` / `fromCents` pair in `packages/shared` with a single NaN and null policy, and import it everywhere.

### `reconcileDifference` exists twice, with the arguments in opposite order
- `apps/api/src/lib/reconcile.ts:25` takes `(statementBalance, clearedBalance)`. `apps/web/src/lib/reconcile.ts:62` takes `(clearedBalance, statementBalance)`.
- Both are pure functions with the same name and meaning. Today each side calls its own copy correctly, but anyone moving code between them will silently flip the sign.
- Fix: move the pure reconcile rules (`reconcileDifference`, `clearedBalanceAsOf`) into `packages/shared` with a single signature, and have both apps import that copy.

## Medium

### Credit vs cash activity is computed in SQL and then thrown away
- `apps/api/src/routers/budget.ts:55` (CASE `klass`), `apps/api/src/lib/budget-math.ts:9,75,95,363`, `routers/budget.ts:575`
- `ActivityRow` carries separate `credit` and `cash` fields, but every consumer just adds them (`rollCategory`, `computeQuickBudget`, the router). The comment at `budget-math.ts:29-33` confirms YNAB 4 treats the two the same. `OverspendKind = "cash"` is misnamed, because credit overspending also gets "cash".
- Fix: drop `klass` from the SQL and collapse `ActivityRow` to a single `amount`, then rename `"cash"` to something like `"affectsBuffer"`. The test block titled "overspending is classified by how it was funded" (`budget-math.test.ts:25`) should be renamed to match.

### YNAB special ids and credit account types are defined in several places
- Income ids: `budget-math.ts:6-7`, `packages/shared/src/types.ts:84-88`, `routers/report.ts:43` (string literals). Split id: `shared/types.ts:87`, `import-yfull.ts:397,426` (literals).
- Credit types: `lib/account.ts:30`, SQL literal at `routers/budget.ts:55`, `apps/web/src/routes/budgets/$budgetId/accounts/index.tsx:40`.
- Fix: export `IMMEDIATE_INCOME`, `DEFERRED_INCOME`, `SPLIT_CATEGORY_ID`, and `CREDIT_ACCOUNT_TYPES satisfies readonly AccountType[]` from `packages/shared` and build the SQL `IN` lists from those constants.

### `importBudgetData` is one 340 line function with no tests
- `apps/api/src/scripts/import-yfull.ts:157-497`. No test file exists under `scripts/`, and `upsertRows`, `adoptMonthlyBudgetRows`, `removeZnabRows`, and the rank logic are all untested.
- Each of the 10 numbered steps repeats the same pattern: map rows, `step(upsertRows)`, `idsByYnabId`. The only tested pieces are the pure helpers that already moved out (`ynab4-mirror.ts`, `staleSubTransactionIds`).
- Fix: move the pure row mappers (`accountRows(data, budgetId, opts)`, etc.) and the rank functions into `lib/ynab4-import.ts` with unit tests. Add one rolled-back-transaction integration test that imports `seed-data/Demo.yfull` twice and asserts the second run writes 0 rows. That is the project's existing verification convention.

### Scheduled split transactions are dropped without a warning
- `apps/api/src/lib/ynab4-package.ts:229-234` merges `scheduledSubTransaction`, but `YnabScheduledTransaction` (`:134-148`) has no `subTransactions`. The schema has no table for them, and `import-yfull.ts:465-487` maps a `Category/__Split__` schedule to `categoryId: null`.
- When a split schedule is entered, it becomes one uncategorized transaction.
- Fix: at minimum, count and `console.warn` split schedules during import. Otherwise, add a `scheduled_sub_transactions` table that mirrors `sub_transactions`.

### Enum-like text columns have no constraints, though shared already defines the vocabularies
- `accounts.ts:16` (accountType), `transactions.ts:27,30` (cleared, flagColor), `scheduled-transactions.ts:26,36`, `payee-rename-rules.ts:22`, `monthly-budgets.ts:22`, `categories.ts:17,39,44`
- `packages/shared/src/types.ts` already has `ACCOUNT_TYPES`, `CLEARED_VALUES`, `FLAG_COLORS`, `FREQUENCY_VALUES`, and `PAYEE_RENAME_OPERATORS`. The lib code compensates with `default:` branches and `as` casts (`payee-rename.ts:42-45`, `web/src/lib/schedule.ts:34`).
- Fix: use `text("x", { enum: ACCOUNT_TYPES })` for typing, plus a `check()` constraint per column (or `pgEnum`), so `$inferSelect` yields the union types and bad rows cannot be stored.

### Columns that nothing reads, or nothing writes
- Never written or read: `transactions.ts:31` checkNumber, `:38` importedPayee, `:39` ynabImportId; `budgets.ts:18-20` currency, dateLocale, budgetType (the import ignores `budgetMetaData`, and the web hard-codes `"USD"` in five places).
- Written by the import and never read: `categories.ts:40` cachedBalance (it also goes stale after the first znab edit), `accounts.ts:22` lastEnteredCheckNum.
- Fix: drop them in a migration, or wire `budgets.currency` from `budgetMetaData.currencyLocale` into `apps/web/src/lib/utils.ts:13`.

### `updatedAt` is maintained by hand
- Every schema file declares `updatedAt ... defaultNow()` with no `$onUpdate`. The routers set `updatedAt` manually in about 37 `.update()` calls.
- Fix: add `.$onUpdate(() => new Date())` to the column, then delete the manual sets.

## Low

### Unused exports in packages/shared
- `USER_SLUGS` (`types.ts:95`) is unused, and `import-yfull.ts:614-618` and `web/src/routes/index.tsx:20,26` hard-code `"zach"`/`"demo"` instead. `SPECIAL_CATEGORY_IDS` (`:84`) and `AssignableClearedValue` (`:13`) are only used internally. All seven `z.infer` types (`schemas.ts:124-130`) have no importers.
- Fix: use `USER_SLUGS` in the importer and the web route, and delete the rest.

### Unused or over-wide lib exports
- `lib/account.ts:22` `preYnabDebtCategoryYnabId` and `:30` `CREDIT_ACCOUNT_TYPES` are only used within the module. In `budget-math.ts`, `BudgetMonth`, `QUICK_BUDGET_LOOKBACK`, and `QuickBudgetAmounts` have no consumers. In `schedule.ts`, `daysInMonth`, `daysBetween`, and `Recurrence` are used only internally or by tests. `ynab4-mirror.ts:23` `MirrorTable` and almost every `Ynab*` interface are unused outside their module.
- Fix: un-export them. `knip` would keep this list current.

### `MergeStats.warnings` is never populated
- `ynab4-package.ts:255,275,522`, read at `import-yfull.ts:644`. Nothing ever pushes to it.
- Fix: remove the field and the loop, or have the gap and orphan paths push their messages into it.

### `staleSubTransactionIds` is in the wrong module
- `ynab4-package.ts:492`. It is importer reconciliation logic, not package reading.
- Fix: move it next to `planMirrorDeletes` in `ynab4-mirror.ts`. The stats literal in `loadBudget` (`:511-523`) also duplicates `applyDiffs:268-276` and should come from a shared `emptyStats()`.

### Small simplifications in the import script
- `import-yfull.ts:211-220` `groupRank` runs `acc.filter` inside `reduce`, which is O(n^2). Two counters (`user++`, `system++`) are enough.
- `:53-56` `parseFloat(val.toFixed(2)).toFixed(2)` exists only to turn `-0.00` into `0.00`. Say so in a comment, or use `(Math.round(val * 100) / 100 + 0).toFixed(2)`.
- `:590-602` `upsertBudget` does select-then-insert on a unique column. Replace it with `insert ... onConflictDoUpdate({ target: budgets.ynabId, set: { name } }).returning()`.
- `:576-584` `adoptMonthlyBudgetRows` issues one UPDATE per row. Batch them with `UPDATE ... FROM (VALUES ...)`.

### Inconsistent nullability between transactions and scheduled transactions
- `scheduled-transactions.ts:36-37` lets `cleared` and `accepted` be null, while `transactions.ts:27-28` declares both `notNull()`. `createdAt` and `updatedAt` are nullable in every table.
- Fix: add `notNull()` in a migration, after backfilling.

### Ambiguous relation from accounts to transactions
- `accounts.ts:31` declares `transactions: many(transactions)`, but `transactions.ts:63-70` defines two `one(accounts)` relations, only one of them named. Nothing queries `accounts.with.transactions` today, but Drizzle will probably reject the ambiguity the first time someone does.
- Fix: name both sides (`relationName: "account"`), or drop the unused `many`.

### `budget-math` empty-input guard depends on `Math.min()` returning Infinity
- `budget-math.ts:151-154`. `startIdx` is computed before the `allMonths.length === 0` check. The `return` at `:240-241` is unreachable.
- Fix: check for empty input first, and replace the trailing return with `throw new Error("unreachable")`.

### db package works only from a specific cwd, and connects on import
- `packages/db/src/migrate.ts:12` resolves `"./migrations"` against the cwd. `packages/db/src/index.ts:8-13` throws, and otherwise opens a pool, as a side effect of being imported, which is why the pure lib tests have to avoid the package.
- Fix: resolve migrations with `path.join(import.meta.dir, "../migrations")`. Keep the schema importable on its own (`@znab/db/schema`) for code that needs only the types.

### Test gaps in tested modules
- `schedule.ts:244` `seriesStart` has no tests, even though it is the function that keeps off-pair TwiceAMonth dates from being stored.
- `budget-math.ts:141` deferred-income month shift has no test.
- `budget-math.ts:192-201` has no test for the path where a confined category was untouched this month but carries a negative balance.
- `authz.ts` has no tests.
- Fix: add a focused test for each of these paths.

### Web schedule helpers duplicate api schedule rules
- `apps/web/src/lib/schedule.ts:38` `canSkip` re-implements `isOneOff` (`api/src/lib/schedule.ts:59`). `FREQUENCY_LABELS` is vocabulary that belongs beside `FREQUENCY_VALUES`.
- Fix: move `isOneOff` and `FREQUENCY_LABELS` to `packages/shared`.
