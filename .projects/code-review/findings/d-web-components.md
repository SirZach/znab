# Chunk D: web components, hooks, lib, store, entry

Scope: `apps/web/src/components/**` (excluding `ui`), `hooks`, `lib`, `store`, `trpc.ts`, `main.tsx`, `styles/globals.css`. Paths below are relative to `apps/web/src`.

## Summary
The pure logic in `lib/` is in good shape: small, documented, and mostly tested. The weak spots are in the layers above it. Query invalidation is a hand-maintained list in each hook, and those lists have already drifted, so some cached data goes stale after writes. `useAccountRegister` combines paging, five queries, seven mutations, scrolling and business rules in one 418 line hook. The four report components are near copies of each other. Styling is written as raw `<button>`, `<input>` and `<select>` elements with long class strings repeated across files, even though the shadcn `Button`, `Input` and `Select` primitives are already installed. Several money and domain rules exist twice, once in web and once in api, and one pair takes its arguments in the opposite order.

## High

### H1. Query invalidation is hand curated per hook and has drifted, leaving stale data
- `hooks/useAccountRegister.ts:126-155`, `hooks/useScheduledTransactions.ts:36-47`, `hooks/useAccounts.ts:28-55`, `hooks/useCategories.ts:19-24`, `hooks/usePayees.ts:28-40`, `hooks/useBudgetPage.ts:17-21`
- Transaction writes (create, update, delete, cleared, reconcile, schedule enter or skip) invalidate `report.netWorth` but not `report.incomeVsExpense`, `report.spendingByCategory`, `report.spendingByPayee`, `budget.quickBudget` (spent last month, average spent), `budget.categoryHistory`, `budget.months` or `householdSplit.month`. All of these read transactions. The inspector's Quick Budget and 12 month history (`components/budget/category-inspector.tsx:86-96`) therefore show figures from before the write until the 30s `staleTime` expires (`main.tsx:11`). `useCategories` invalidates `budget.monthData`, which no web code queries.
- Fix: add one `lib/invalidate.ts` with two or three named helpers built on router level invalidation, for example `invalidateLedger(utils)` that calls `utils.account.invalidate()`, `utils.budget.invalidate()`, `utils.report.invalidate()`, `utils.payee.invalidate()`, `utils.scheduledTransaction.invalidate()` and `utils.householdSplit.invalidate()`. Only mounted queries refetch, so invalidating too much costs little in a single user app, while invalidating too little produces wrong numbers. Delete the per hook lists and the comments that justify each entry.

### H2. `useAccountRegister` is a 418 line hook that mixes five concerns
- `hooks/useAccountRegister.ts:36-418`
- One hook owns paging (`pageCount` state with `useQueries`, `:65-106`), the focus row lookup (`:75-80`), lookup queries for accounts, categories and payees (`:108-122`), the upcoming schedule band and its enter and skip mutations (`:115-163`, `:383-389`), transaction CRUD (`:165-351`), reconciliation (`:180`, `:261-269`), DOM scrolling (`:190-197`), and pure domain rules (`isReconciled` `:28`, `transferKeepsCategory` `:231`). The returned object has roughly 40 fields.
- Fix, split it:

| New unit | Takes from `useAccountRegister` |
|---|---|
| `useRegisterPages` | Paging and focus offset, rewritten on `trpc.account.transactions.useInfiniteQuery` (expose `cursor` in place of `offset` in the API input) |
| `useRegisterWrites` | create, update, delete and cycleCleared, with their error and reset fields |
| `useReconcile` | the reconcile mutation, its result and its reset |
| reuse `useScheduledTransactions` (`enter`, `skip`) | `enterScheduled`, `skipScheduled` and their state, which currently duplicate `useScheduledTransactions.ts:60-65` |
| `lib/register-row.ts` | `isReconciled` and a pure `transferKeepsCategory(account, accounts, id)`, both covered by tests |
| caller (route) | the `scrollTo` in `createMutation.onSuccess`. `onSaveSuccess` already exists for this. |

### H3. `useEffect` resets state when props change
- `hooks/useAccountRegister.ts:67-70`
- Resetting `pageCount` in an effect is the "adjusting state when a prop changes" anti-pattern described in react.dev/learn/you-might-not-need-an-effect. On the first render after switching account, filter, search or sort, `useQueries` runs with the old `pageCount` against the new query key and starts N page requests that are thrown away once the reset commits.
- Fix: `useInfiniteQuery` (see H2) resets automatically when the input key changes. Without that change, store `{ key, count }` and derive `count = state.key === currentKey ? state.count : 1` during render.

### H4. Raw HTML controls with repeated class strings, even though shadcn primitives are installed
- Counts across `src` excluding `ui`: 77 raw `<button>` against 34 `<Button>`, 28 raw `<input>` (`ui/input` imported in 2 files), 14 raw `<select>` (`ui/select` imported in 1 file).
- Repeated strings in this chunk:
  - Text field: `rounded border border-border bg-background px-2 py-1.5 text-sm ... focus:ring-1 focus:ring-ring`, 10 times. Examples: `components/budget/category-inspector.tsx:272,291,471,485,494` and `components/budget/bulk-budget-panel.tsx:59`.
  - Primary button: `rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50`, 8 times. Examples: `category-inspector.tsx:301,502` and `bulk-budget-panel.tsx:68`.
  - Outline button: `rounded border border-border px-2.5 py-1.5 text-sm ...`, 5 times. Examples: `category-inspector.tsx:223,340`, `bulk-budget-panel.tsx:78` and `register/bulk-panel.tsx:161,178`.
  - Icon close button: `p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors`, 7 times. Examples: `category-inspector.tsx:133,144`, `bulk-panel.tsx:90` and `bulk-budget-panel.tsx:34`.
  - Section heading: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`, 15 times across 5 files.
  - Side panel shell: `aside w-80 shrink-0 border-l border-border bg-card overflow-y-auto`, 4 times (`bulk-panel.tsx:78`, `bulk-budget-panel.tsx:23`, plus 2 in routes).
  - Underline input: `inputClass` at `register/row-fields.tsx:109` and `statementInputClass` at `register/reconcile-panel.tsx:26` are near copies.
- Fix:
  - Use `Button` (variants `default`, `outline`, `ghost`, `destructive`; size `icon-sm`) and `Input`.
  - Add an `xs` size to `buttonVariants` (`ui/button.tsx:22-28`) so that overrides such as `className="h-6 px-2 text-xs"` (`register/upcoming-panel.tsx:107,117`) and `h-auto py-0.5 px-1` go away.
  - Add an `underline` variant to `Input`.
  - Create `components/panel/side-panel.tsx` exporting `SidePanel`, `SidePanelHeader` (title, subtitle, onClose) and `SidePanelSection` (title, children), one component per file or one small compound module.
  - Create `components/money-input.tsx`: a text input with `inputMode="decimal"`, right aligned `tabular-nums` and a `0.00` placeholder. It is repeated 6 times in this chunk.

### H5. The four report components duplicate their scaffolding
- `components/reports/income-vs-expense-report.tsx`, `net-worth-report.tsx`, `spending-by-category-report.tsx`, `spending-by-payee-report.tsx`
- Each file has its own copy of:
  - `TIMEFRAMES`: 4 copies, `:15` in each file.
  - `formatCompactCurrency`: 4 copies (`:36`, `:36`, `:23`, `:23`).
  - `formatMonthTick`: 2 copies (`:28`).
  - The timeframe toggle: 4 copies.
  - The tooltip `contentStyle` object and the axis `tick`/`stroke` props: 4 copies.
  - `CenteredMessage`: 4 copies, with heights that differ between `h-[28rem]` and `h-60`.
  - `SummaryStat`: 2 copies.
- The API already defines the timeframe enum at `apps/api/src/routers/report.ts:7`, so a fifth copy exists on the server.
- Fix:
  - Move `REPORT_TIMEFRAMES` to `packages/shared`.
  - Add `components/reports/report-layout.tsx`: title, timeframe toggle and stats slot, and a chart card that handles loading and empty states.
  - Add `components/reports/timeframe-toggle.tsx` and `components/reports/summary-stat.tsx`.
  - Add `lib/chart.ts` with `axisProps`, `tooltipProps`, `formatMonthTick` and `formatCompactCurrency`.
  - Each report then keeps only its query and its chart series.

## Medium

### M1. Money and domain rules duplicated between web and api; one pair takes its arguments in the opposite order
| Web | API | Note |
|---|---|---|
| `lib/reconcile.ts:62` `reconcileDifference(cleared, statement)` | `apps/api/src/lib/reconcile.ts` `reconcileDifference(statement, cleared)` | Same name, swapped parameter order. A move to shared would invert the sign silently. |
| `lib/reconcile.ts:23` `cents` | `apps/api/src/lib/reconcile.ts` `cents`, `apps/api/src/lib/budget-math.ts:50` `cents` | Three copies. Only the web copy guards against NaN. |
| `lib/register-row.ts:279` `transferCategoryEditable` | `apps/api/src/lib/transfer.ts:16` `transferCategoryId` | Same rule (`own.onBudget && !other.onBudget`). |
| `lib/schedule.ts:139` `canSkip` | `apps/api/src/lib/schedule.ts:59` `isOneOff` | Each is the negation of the other. |
| `components/budget/category-inspector.tsx:7-16` `GoalType`, `CategoryGoal`; `:25` overspend kind; `hooks/useBudgetPage.ts:66` literal union | `apps/api/src/lib/budget-math.ts:34,247-258` | Type copies. |
- Fix: add `packages/shared/src/money.ts` (`toCents`, `fromCents`, `sumMoney`, `reconcileDifference` with a single argument order), `packages/shared/src/transfer.ts` (`transferCarriesCategory`) and `GOAL_TYPES`/`GoalType`/`OverspendKind` in `types.ts`. Import them on both sides and move the existing tests along with the code.

### M2. Category options and the category or payee comboboxes are built in several places
- `categoryOptions` derivation: 3 copies at `hooks/useAccountRegister.ts:209-214`, `hooks/usePayees.ts:63-68` and `routes/budgets/$budgetId/scheduled/index.tsx:107`.
- The Popover plus Command category picker appears at `components/register/row-fields.tsx:356-398` and `components/register/bulk-panel.tsx:107-142`, and 2 more times in `scheduled/index.tsx` (around `:577` and `:633`). The payee picker appears at `row-fields.tsx:274-345` and in `scheduled/index.tsx`.
- Fix: add `lib/category-options.ts` exporting `toCategoryOptions(groups)`, or a `useCategoryOptions(budgetId)` hook. Add `components/pickers/category-combobox.tsx` and `payee-combobox.tsx` that take `value`, `onSelect`, `options` and an optional trigger render. `RegisterRowFields` keeps only the focus choreography.

### M3. Three different segmented toggle implementations
- `components/budget/category-inspector.tsx:240-264` (move direction), `components/register/cleared-filter.tsx:31-54`, and the report timeframe toggle (4 copies, see H5). Their active styles differ: `bg-primary`, `bg-accent`, `bg-primary` with `rounded-md`.
- Fix: one `components/segmented-control.tsx` with `cva` variants (`primary`, `subtle`), or the shadcn `ToggleGroup`.

### M4. No semantic color tokens; success and warning colors are hardcoded and inconsistent
- The `text-green-600 dark:text-green-500` and `text-amber-600 dark:text-amber-400` pairs appear 9 times. Examples: `category-inspector.tsx:445,613,652-653` and `upcoming-panel.tsx:52,73,98`.
- Inconsistent variants: `reconcile-panel.tsx:175` uses `text-green-500` alone, and `category-inspector.tsx:433` uses `bg-amber-500`/`bg-green-600`.
- Chart colors are hex literals in each report: `INCOME_COLOR`, `DEBTS_COLOR`, `BAR_COLOR`, and so on.
- Fix: add `--success`, `--warning` and `--chart-1..5` to `styles/globals.css` `:root`/`.dark` and map them in `@theme inline`. Use `text-success` and `text-warning`, and read the chart colors from `var(--color-chart-1)`. Also add a pure `availableTone(available, overspendKind)` (inspector `:180-188`) to share with the budget grid.

### M5. One component per file: files that define several components
| File | Components | Proposed split |
|---|---|---|
| `components/budget/category-inspector.tsx` (661 lines) | `CategoryInspector`, `GoalSection`, `HistorySection`, `SpentSection`, `Row` | `budget/inspector/category-inspector.tsx`, `goal-section.tsx`, `history-section.tsx`, `spent-section.tsx`. `Row` becomes a shared `components/stat-row.tsx` (also usable for `BalanceFigure`). Also extract `QuickBudgetSection` and `MoveMoneySection` from the body (`:212-309`). |
| `components/register/row-fields.tsx` (446 lines) | `FlagCell`, `RegisterRowFields` | `flag-cell.tsx`, `row-fields.tsx`. Also extract `DateField` (`:206-265`) and use the pickers from M2. |
| `components/register/reconcile-panel.tsx` | `ReconcilePanel`, `ReconcileSummary` | `reconcile-panel.tsx`, `reconcile-summary.tsx`. Also move the confirm `Dialog` (`:223-240`) into `confirm-adjustment-dialog.tsx`. |
| `components/register/balances.tsx` | `BalanceFigure`, `AccountBalances` | `balance-figure.tsx`, `account-balances.tsx` |
| `components/reports/income-vs-expense-report.tsx` | report, `SummaryStat`, `CenteredMessage` | Use the shared report pieces from H5 |
| `components/reports/net-worth-report.tsx` | report, `SummaryStat`, `CenteredMessage` | Same |
| `components/reports/spending-by-category-report.tsx` | report, `CenteredMessage` | Same |
| `components/reports/spending-by-payee-report.tsx` | report, `CenteredMessage` | Same |

### M6. `formatCurrency` builds a new `Intl.NumberFormat` on every call
- `lib/utils.ts:9-15`. It is called several times per register row, and a register holds 200 to 1,000 rows that re-render while the add row is being typed in. The same happens in the 4 `formatCompactCurrency` copies.
- Fix: create the formatter once at module scope: `const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`.

### M7. `RegisterSearch` seeds local state from a prop and leaves a pending timer behind
- `components/register/register-search.tsx:30-37`. `text` is copied from `value` once. When the route moves to another account, the component stays mounted because TanStack Router does not remount on a param change, and the caller does not key it (`routes/budgets/$budgetId/accounts/$accountId.tsx:514`). The old text stays in the box. A settle timer that is still pending fires `onSearch` after the move and writes the old `q` into the new account's URL.
- Fix: key the component on `accountId` at the call site and clear the timer on unmount, or replace the hand rolled debounce with a small `useDebouncedCallback` that cancels on unmount.

### M8. Money is summed in floating point in the bulk panels
- `components/register/bulk-panel.tsx:72` (`Number(r.amount)`) and `components/budget/bulk-budget-panel.tsx:20`. Everywhere else the codebase sums in cents.
- Fix: use `sumMoney` from the shared money module (M1).

### M9. Missing tests
- Lib functions with no tests:
  - `lib/utils.ts`: `formatCurrency`, `monthParamToDate`, `dateToMonthParam`, `currentMonthParam`, `formatDate`, `formatDateISO`.
  - `lib/schedule.ts`: `frequencyLabel` and its unknown value fallback, `canSkip`.
  - `hooks/useBudgetLayout.ts:14` `groupAccounts`: a pure function in a hook file. Move it to `lib/accounts.ts`.
  - `hooks/useAccountRegister.ts:28` `isReconciled`: pure. Move it to `lib/register-row.ts`.
- Component logic that can be extracted and tested as pure functions:
  - `SortHeader` next direction (`components/register/sort-header.tsx:30-36`).
  - Inspector available tone and suggested move amount (`category-inspector.tsx:98-123,180-188`).
  - `RegisterBulkPanel` counts (`bulk-panel.tsx:71-75`).
  - `formatMonthTick` and the net worth tooltip sign flip (`net-worth-report.tsx:106-109`).
  - Goal save mapping from `YYYY-MM` to the first day of the month (`category-inspector.tsx:380-389`).
  - The update payload built in `updateTransaction` (`useAccountRegister.ts:318-340`), which decides when to omit payee and category. It is the riskiest untested logic in this chunk; extract it as `buildTransactionUpdate(txn, fields, keepsCategory)`.
- No hook or component test setup exists: no `@testing-library/react` and no `happy-dom`. Extracting the logic above avoids needing one for now.

## Low

### L1. Stale doc comments about a check number field that no longer exists
- `lib/register-row.ts:227-231` (JSDoc with no field), `components/register/row-fields.tsx:152-156` (JSDoc with no prop), `row-fields.tsx:115` (lists a "check number" cell), `hooks/useAccountRegister.ts:287-288` (comment attached to `cleared`), and `useAccountRegister.ts:13` (an orphan JSDoc above another JSDoc).
- Fix: delete them.

### L2. Mutation error and reset boilerplate in every hook
- `hooks/useAccounts.ts:116-131`, `useCategories.ts:97-118`, `usePayees.ts:107-125` and `useScheduledTransactions.ts:106-124` each list every mutation twice by hand, once for `error?.message ?? null` and once in `resetStatus`.
- Fix: add `const errorOf = (m) => m.error?.message ?? null` and `const resetAll = (...ms) => ms.forEach((m) => m.reset())` in `lib/mutation.ts`. Alternatively, return the mutations themselves and let callers read `.error` and `.isPending`.

### L3. Small inconsistencies in the hook API
- `useBudgetPage.setBudgeted` (`hooks/useBudgetPage.ts:42-49`) takes `budgetId` and `month` again, unlike its siblings. Bind them as `moveMoney` does.
- `useBudgetLayout` receives `queryClient` as a parameter (`hooks/useBudgetLayout.ts:25-31`). Use `useQueryClient()`.
- `useBudgetList` and `useBudgetMonths` are 6 line wrappers that add nothing. Inline the queries or leave them, but do not add more wrappers like them.

### L4. Row types read through `ReturnType<typeof useX>`
- `hooks/useAccounts.ts:8`, `useCategories.ts:8-9`, `usePayees.ts:8`, `useScheduledTransactions.ts:8`, `useAccountRegister.ts:32`. The comment says this avoids depending on router types, but `trpc.ts:3-8` already imports them.
- Fix: export `type RouterOutputs = inferRouterOutputs<AppRouter>` from `trpc.ts` and derive the row types from it.

### L5. Imperative `setTimeout(0)` focus and scroll workarounds
- `components/register/row-fields.tsx:331-335,388` and `hooks/useAccountRegister.ts:190-197`.
- Fix: the Base UI Popover supports `finalFocus` to choose where focus goes on close, which removes the timers. The register scroll belongs in the caller's `onSaveSuccess`.

### L6. `GoalSection` draft state comes from the first mount, not from when editing starts
- `components/budget/category-inspector.tsx:372-375`. If a goal is saved or removed and Edit is clicked again, the form shows the values from the first mount.
- Fix: seed `type`, `target` and `targetMonth` in the click handler that sets `editing` to true.

### L7. Invalid `dl` content in the reconcile panel
- `components/register/reconcile-panel.tsx:179-182`: a `div` with `span` children sits inside a `dl` instead of `dt`/`dd`.
- Fix: render `BalanceFigure` with a text value, or give it a `placeholder` prop.

### L8. Styling foundation
- `components.json` declares the `base-vega` style, while `styles/globals.css` uses the legacy HSL triplet tokens. Chart code depends on `hsl(var(--border))`, so a later token migration to oklch would break every chart silently.
- Fix: use `var(--color-border)` and similar in chart props.
- `.dark` does not redefine the sidebar tokens (`globals.css:38-58`). This looks intentional (the sidebar is always dark) but is not documented.
- `hooks/use-mobile.ts` is generated by shadcn, so leave it.
