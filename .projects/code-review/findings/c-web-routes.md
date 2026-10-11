# Chunk C: apps/web/src/routes

## Summary
The route files are carefully reasoned and well commented, but they act as feature modules rather than routes: 8 of 14 files define 3 to 10 components each, and the 5 largest (`$accountId.tsx` 1004, `$budgetId/index.tsx` 910, `scheduled/index.tsx` 797, `payees.tsx` 718, `accounts/index.tsx` 703) hold pure business rules inline where nothing can test them. The same UI is rebuilt by hand in each route: three copies of `NameInput`, four of `fieldClass`, about eight primary buttons typed as raw class strings even though `Button` and its cva variants exist, four side panel shells, four delete confirm dialogs and seven loading placeholders. Only `balancing.tsx` uses the shadcn primitives (`Table`, `Select`, `Input`, `Card`) consistently. There are 3 useEffects: one is a real anti pattern (a prop to state sync in `BudgetedCell`) and two are legitimate. There are no component tests, and none of the logic in these files is covered by the existing `lib/*.test.ts`.

Line anchors are relative to `apps/web/src/routes/`.

## High

### H1. Three copies of the inline rename input, and they have drifted apart
- `budgets/$budgetId/payees.tsx:352`, `budgets/$budgetId/accounts/index.tsx:275`, `budgets/$budgetId/categories/index.tsx:453`
- They are the same component with the same Escape flag trick and the same class string. They have already diverged: the categories copy trims before `onCommit` and spreads `aria-label`, while the other two hard code the label and leave callers to trim (`payees.tsx:121`, `accounts/index.tsx:97`). The "click to rename" trigger button is also repeated (`payees.tsx:250`, `accounts/index.tsx:211`, `categories/index.tsx:201,280`).
- Fix: add `components/common/inline-name-edit.tsx` that owns both states (a button that shows the name, and the input), takes `value`, `onRename(trimmed)` and `aria-label`, and skips the call when the trimmed value is empty or unchanged. Delete the three local copies along with the `commitRename` helpers.

### H2. Tailwind class sprawl stands in for primitives that already exist
- `fieldClass` is defined four times, identically: `payees.tsx:54`, `accounts/index.tsx:45`, `scheduled/index.tsx:47`, `categories/index.tsx:32`. It styles raw `<input>` and `<select>` elements, while `components/ui/input.tsx` and `select.tsx` exist and `balancing.tsx:247-275` already uses them.
- The `Button` default variant is hand typed as `rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors` at `scheduled/index.tsx:156,781`, `payees.tsx:453,608`, `accounts/index.tsx:468,629` and `$accountId.tsx:774`. The outline style is hand typed at `payees.tsx:314,444,684`, `accounts/index.tsx:648` and `categories/index.tsx:526`, and the destructive outline at `payees.tsx:707` and `accounts/index.tsx:660`.
- The field label `block text-xs text-muted-foreground mb-1` appears 9 times in `scheduled/index.tsx:541-763` and 6 times in `accounts/index.tsx:364-435`.
- The section heading `text-xs font-semibold uppercase tracking-wider text-muted-foreground` appears 15 times across the routes and components.
- Fix: use `<Button>` everywhere. Add an `xs` size (h-7 px-2 text-xs) and a `destructive-outline` variant to `buttonVariants`, plus a `subtle` variant for the small text actions (`scheduled/index.tsx:50 actionClass`, `$accountId.tsx:627,736`). Add `components/common/field.tsx` (`<Field label>` around a child control) and `section-heading.tsx`, and replace raw `<select>`/`<input>` with `Input` and `Select`.

### H3. Route files define many components (see the split table)
- `$accountId.tsx`, `$budgetId/index.tsx`, `scheduled/index.tsx`, `payees.tsx`, `accounts/index.tsx`, `categories/index.tsx`, `$budgetId.tsx` and `balancing.tsx` each define between 3 and 10 components, plus inline render functions (`balancing.tsx:203 budgetSelect`) and module constants that describe the domain.
- Fix: a route file should hold `createFileRoute`, read its params and search, and compose feature components from `components/<feature>/`. Proposed targets are in the table below.

### H4. Row selection logic is duplicated and untested
- `$budgetId/index.tsx:146-172` and `$accountId.tsx:364-386` contain the same shift range, ctrl/cmd toggle and plain click algorithm, line for line. Both files also keep the same `selectedIds`/`anchorId` state pair and the same "Set toggle" idiom, which appears again at `payees.tsx:104`.
- Fix: extract a pure `nextSelection({ selected, anchor }, { id, shift, toggle }, orderedIds)` into `lib/selection.ts` with unit tests, and wrap it in `hooks/useRowSelection(orderedIds)` returning `{ selectedIds, select, clear, isSelected }`. The budget grid's mobile case can be handled with `select(id, { plain: true })`.

### H5. Register business rules live inline in the route
- `$accountId.tsx:269-283 locksFor`: decides which fields are locked for transfers and splits.
- `$accountId.tsx:107-121 flagColorOf` and `fieldsFrom`: map a transaction to editable fields.
- `$accountId.tsx:398-413 clickRow`: decides whether a click edits or selects.
- `$accountId.tsx:424-462`: bulk eligibility (categorise skips locked rows, cleared skips reconciled rows) and the text of the result notes.
- `$accountId.tsx:331, 781`: which error is shown, resolved by precedence (`updateError ?? deleteError ?? editBlocked`).
- Fix: move `locksFor` (taking `transferKeepsCategory` as an argument), `fieldsFrom`, `flagColorOf`, and a `planBulkCategorise` / `planBulkCleared` pair that returns `{ targets, skipped, note }` into `lib/register-row.ts`, and add tests to the existing `register-row.test.ts`. The page then only dispatches. A `useRegisterBulkActions` hook could own `bulkNote` too.

## Medium

### M1. useEffect copies a prop into state (BudgetedCell)
- `$budgetId/index.tsx:659-661`: `useEffect(() => { if (!editing) setDraft(value.toFixed(2)) }, [value, editing])` is the "adjust state when a prop changes" pattern described in You Might Not Need an Effect. It renders a stale value first and then renders again.
- Fix: derive what is shown: `const shown = editing ? draft : value.toFixed(2)`, and seed `draft` from `value` in `onFocus`. The Escape and commit paths then only need `setEditing(false)`.

### M2. Bulk actions send one mutation per row from the client
- `$accountId.tsx:426-428` (categorise), `447` (cleared), `460` (delete) and `$budgetId/index.tsx:198-200` (budget the selection) each fire N separate mutations in a loop. That means N round trips and N invalidations, and a partial failure leaves a mixed state that `bulkNote` cannot report accurately ("Deleting 12." is written before anything has completed).
- Fix: add bulk endpoints (`transaction.bulkUpdate`, `transaction.bulkDelete`, `budget.setBudgetedMany`) that return per row results, and have the page show the server's counts. Until then, document this as known technical debt.

### M3. The side panel shell is duplicated
- `payees.tsx:523-539`, `accounts/index.tsx:552-570`, `scheduled/index.tsx:339-355`, and also `components/budget/bulk-budget-panel.tsx:23` and `components/register/bulk-panel.tsx:78`, all repeat `aside w-80 shrink-0 border-l border-border bg-card overflow-y-auto` with the same title, subtitle and X close header.
- Fix: add `components/common/side-panel.tsx` (`SidePanel` with `title`, `subtitle`, `onClose` and an optional `width`) and `PanelSection` (`px-4 py-3 border-b space-y-2` plus the section heading).

### M4. The confirm-delete dialog is rebuilt four times
- `$accountId.tsx:972-1000`, `accounts/index.tsx:675-699`, `scheduled/index.tsx:376-404`, `categories/index.tsx:366-387` (and `$accountId.tsx:816-860` uses the same structure). Two of them are mounted conditionally (`doomed && <Dialog open>`) and the others are always mounted with `open={confirming}`, so close animations behave inconsistently.
- Fix: add `components/common/confirm-dialog.tsx` (`title`, `description`, `confirmLabel`, `variant`, `open`, `onConfirm`, `onOpenChange`) and keep it always mounted, driven by `open`.

### M5. Page chrome is duplicated: loading state, header and error banners
- Loading: `$accountId.tsx:253`, `$budgetId/index.tsx:210`, `scheduled/index.tsx:127`, `payees.tsx:126`, `accounts/index.tsx:116`, `categories/index.tsx:114`, `budgets/index.tsx:20`.
- Header (`px-6 py-4 border-b` with an `h2 text-xl` and a muted count): `scheduled/index.tsx:137`, `accounts/index.tsx:126`, `categories/index.tsx:124`, `payees.tsx:137`, `accounts/all.tsx:62`.
- Error lists: `scheduled/index.tsx:197-207`, `categories/index.tsx:89-99,142-150`, `accounts/index.tsx:140-147`, `payees.tsx:181-193`.
- Fix: add `PageLoading`, `PageHeader` (title, subtitle, actions) and `ErrorList` (`messages: (string | null)[]`) to `components/common/`. Consider having each hook return `errors: string[]` so routes stop listing nine error fields (`categories/index.tsx:89-99`).

### M6. categoryOptions is built in three places, and scheduled queries tRPC from the route
- `scheduled/index.tsx:103-108` duplicates `hooks/useAccountRegister.ts:209-213` and `hooks/usePayees.ts:63-67` exactly. `scheduled/index.tsx:93-95` also calls three `trpc.*.useQuery` directly in the route, and `accounts/all.tsx:38` and `accounts/index.tsx:519` do the same.
- Fix: add a pure `toCategoryOptions(groups)` in `lib/` (tested) and a `useCategoryOptions(budgetId)` hook. Move the scheduled page's account, payee and category queries into `useScheduledTransactions`, and the All Accounts query into a `useAllAccountsRegister` hook.

### M7. The payee and category comboboxes are duplicated between the scheduled form and the register
- `scheduled/index.tsx:558-654` rebuilds the Popover + Command payee and category pickers that `components/register/row-fields.tsx:299,377` already implement.
- Fix: extract `PayeeCombobox` and `CategoryCombobox` (controlled, with `payees` or `options`, `value`, `onChange`) and use them in both places. The date picker trigger is repeated in the same way (`scheduled/index.tsx:692-717`, `accounts/index.tsx:436-462`), so add a `DatePickerButton`.

### M8. Reorder logic and arrows are duplicated, and the account type rules are copied from the API
- `categories/index.tsx:36-43 swapped` and `accounts/index.tsx:107-114 move` are the same swap. `categories/index.tsx:399 Arrows` is a component, while `accounts/index.tsx:184-199` inlines the same two buttons.
- `accounts/index.tsx:29-40` (`ACCOUNT_TYPE_LABELS`, `typeLabel`, `isCredit`) restates `CREDIT_ACCOUNT_TYPES` from `apps/api/src/lib/account.ts:30`.
- Fix: add `lib/reorder.ts swapIds` with a test and a shared `components/common/reorder-arrows.tsx`. Move `CREDIT_ACCOUNT_TYPES`, `isCreditType` and the type labels into `@znab/shared` so the web and the API cannot disagree.

### M9. The All Accounts register works differently from the account register
- `accounts/all.tsx:32-36` keeps `q`, `cleared`, `sort`, `dir` and `offset` in `useState`, so unlike `$accountId.tsx:125` a filtered view cannot be linked to or survive a reload.
- `accounts/all.tsx:50-58 sortBy` ignores the `dir` that `SortHeader` passes and applies its own default (date ascending), which contradicts the documented date descending default in `components/register/sort-header.tsx`.
- Signed amounts are recomputed with `Number(txn.amount)` three times (`all.tsx:169-172`). Inflow is shown green in `$accountId.tsx:705` but not here, and a negative balance is shown red here but not in `$accountId.tsx:712`.
- Fix: give `all.tsx` a `validateSearch` schema shared with the register, use `onSort(column, dir)` as given, and render money with the shared cells from M10.

### M10. The money cells are not a shared component
- Outflow/inflow splitting appears at `$accountId.tsx:641-642,702-707` and `accounts/all.tsx:168-173`, although `lib/register-row.ts:37 amountToFields` already does the split. Signed tone logic appears at `$budgetId/index.tsx:506-507` (`availColor`), `575-582` (`AvailablePill`) and `616` (`Stat`), and at `balancing.tsx:164`.
- Fix: add `components/common/money.tsx` with `<Money amount tone="signed|plain">` and `<OutflowInflowCells amount>`, built on a cva `moneyTone` variant (positive, negative, confined, zero). Use it in both registers, the budget grid and balancing.

### M11. Data shaping in the budget grid render
- `$budgetId/index.tsx:125-144` (`visibleRowIds`, `selected`, `moveSources`), `259-267` (group totals reduced on every render, per group), `468-477` (bulk panel rows) and `864-869` (`MonthPicker` grouping by year) are all inline.
- Fix: move these into `useBudgetPage` or pure functions in `lib/budget-grid.ts` (`groupTotals`, `visibleCategoryIds(groups, collapsed)`, `monthsByYear`), and test them.

### M12. The auth guard is copy-pasted into three routes
- `$budgetId.tsx:52-56`, `balancing.tsx:39-43`, `budgets/index.tsx:9-13`.
- Fix: use a pathless `_authed` layout route that owns `beforeLoad`, or at least a shared `requireUser()` in `lib/`.

### M13. balancing.tsx calls mutations inline and hides a component in a render function
- `balancing.tsx:181-189` sets up tRPC utils and two mutations inside `SplitSettings`, `192-198 canSave` is inline validation, and `203-226 budgetSelect` is a component written as a closure.
- Fix: add `hooks/useHouseholdSplit.ts` (queries, mutations, invalidation) and `components/balancing/budget-select.tsx`. Move `canSave` into a pure, tested `validSplitSettings` function.

### M14. Schedule draft mapping is untested
- `scheduled/index.tsx:428-456 draftFrom` and `503-523` (draft to `NewScheduled`, including the sign and twice a month rules) are pure.
- Fix: move both into `lib/schedule.ts` next to the tested helpers and add cases to `schedule.test.ts`.

## Low

- **L1. An orphan doc comment.** `scheduled/index.tsx:56` documents a function that has been moved to `lib/schedule.ts`. Delete it.
- **L2. Emojis and an em dash in UI data.** `index.tsx:22-29` (the `emoji` fields, and an em dash in the "Personal budget" description). These break the house style. Use lucide icons and a comma instead.
- **L3. The report list has two sources of truth.** `reports/index.tsx:8` lists the reports and `reports/$reportId.tsx:16` switches on the same ids. Use a single `REPORTS` registry with the component in each entry, and validate `reportId` in the route params.
- **L4. The link card class is repeated.** `index.tsx:57`, `budgets/index.tsx:42,52`, `reports/index.tsx:53`. Extract a `LinkCard` or a cva `cardLink`.
- **L5. Month navigation is duplicated.** `$budgetId/index.tsx:203-208,226-238` and `balancing.tsx:57-59,74-92`. Extract `MonthNav` and a `shiftMonthParam(param, delta)` function in `lib/utils.ts` (with a test).
- **L6. Type casts the schema should make unnecessary.** `$accountId.tsx:190` (`cleared as ...`), `scheduled/index.tsx:452,727`, `accounts/index.tsx:381,530,582`. Tighten `accountRegisterSearchSchema` and the API row types so the casts go away.
- **L7. Prop types are taken from hook return types inline.** `ReturnType<typeof useX>["..."]` appears at `$accountId.tsx:919-921`, `payees.tsx:485-486`, `accounts/index.tsx:319,509-510`. Export named types from the hooks.
- **L8. Hook results are very wide.** `$accountId.tsx:146-187` destructures 40 fields from `useAccountRegister`, and `categories/index.tsx:56-81` destructures 25. Group each mutation as `{ run, isPending, error, reset }` so props and errors compose.
- **L9. Two legitimate effects that could be simpler.** The Escape listener at `$accountId.tsx:233-243` is a valid external subscription, but it repeats `clearSelection` (`352-356`). Fold it into `useRowSelection` (H4). The scroll effect at `249-251` could be a ref callback on the focused row. The `setTimeout` focus at `204` could be replaced by `autoFocus` keyed on a save counter.
- **L10. Hidden categories rendering.** `$budgetId/index.tsx:366-417` is a self contained block. Move it into a `HiddenCategoryRows` component.
- **L11. Raw tables.** Every route except `balancing.tsx` uses raw `<table>` with ad hoc header classes. Adopting `components/ui/table.tsx`, or a small `DataTable` header/row cva, would remove most of the repeated `px-* py-2` cell strings.

## Missing tests (extractable logic with no coverage)
None of the pure logic below has a test. All of it should move to `lib/` with `bun test` coverage. There is no component test setup (no testing-library or DOM environment in `apps/web/package.json`), so extracting the logic is the only practical way to test it.
- `nextSelection` (H4)
- `locksFor`, `fieldsFrom`, `flagColorOf`, and the bulk plan and note builders (H5)
- `autofillAmount` and `hasAutofill` (`payees.tsx:35-52`), and the merge summary text (`payees.tsx:405-437`)
- `swapIds`, `typeLabel` and `isCreditType` (M8), and the dirty `patch` builder (`accounts/index.tsx:543-549`)
- Schedule `draftFrom` and `draftToInput` (M14)
- `groupTotals`, `visibleCategoryIds`, `monthsByYear` and the summary signs (M11, `$budgetId/index.tsx:511`)
- `useCollapsedGroups` storage parsing (`$budgetId/index.tsx:60-89`, which belongs in `hooks/`)
- `validSplitSettings` (M13), `toCategoryOptions` (M6), `shiftMonthParam` (L5)

## Per-file split table

| File (lines) | Components defined | Proposed new files |
|---|---|---|
| `budgets/$budgetId/accounts/$accountId.tsx` (1004) | AccountRegisterPage, ClearedCell, EditCells, plus inline reconciled warning dialog, delete dialog, read only row, header | `components/register/cleared-cell.tsx`, `edit-cells.tsx`, `register-row.tsx` (read only cells), `register-header.tsx` (account title and balances), `register-column-header.tsx` (colgroup and sort headers), `reconciled-warning-dialog.tsx`, `add-row.tsx`. Logic goes to `lib/register-row.ts` and `hooks/useRowSelection.ts` |
| `budgets/$budgetId/index.tsx` (910) | BudgetPage, BudgetGrid, BudgetSummary, Stat, GoalDot, AvailablePill, BudgetedCell, AdjustButton, MonthPicker, useCollapsedGroups (hook) | `components/budget/budget-grid.tsx`, `budget-group-rows.tsx`, `hidden-category-rows.tsx`, `budget-summary.tsx` (with `Stat`), `goal-dot.tsx`, `available-pill.tsx`, `budgeted-cell.tsx`, `adjust-button.tsx`, `month-picker.tsx`, `hooks/useCollapsedGroups.ts`, `lib/budget-grid.ts` |
| `budgets/$budgetId/scheduled/index.tsx` (797) | ScheduledPage, ScheduleForm | `components/scheduled/schedule-form.tsx`, `scheduled-table.tsx` (row and actions), `enter-due-banner.tsx`, `schedule-edit-panel.tsx`. Draft mapping goes to `lib/schedule.ts` |
| `budgets/$budgetId/payees.tsx` (718) | PayeesPage, NameInput, MergeBar, PayeeInspector | `components/payees/payee-table.tsx`, `merge-bar.tsx`, `payee-inspector.tsx`, `autofill-section.tsx`, `rename-rules-section.tsx`, `lib/payees.ts`. NameInput is replaced by `components/common/inline-name-edit.tsx` |
| `budgets/$budgetId/accounts/index.tsx` (703) | AccountsPage, NameInput, NewAccountForm, AccountInspector | `components/accounts/account-table.tsx`, `new-account-form.tsx`, `account-inspector.tsx`. Shared: `inline-name-edit.tsx`, `reorder-arrows.tsx`. Type helpers go to `@znab/shared` |
| `budgets/$budgetId/categories/index.tsx` (532) | CategoriesPage, Arrows, DeleteButton, NameInput, AddRow | `components/categories/category-group-rows.tsx`, `components/common/reorder-arrows.tsx`, `icon-delete-button.tsx`, `inline-name-edit.tsx`, `add-name-row.tsx`, `lib/reorder.ts` |
| `budgets/$budgetId.tsx` (351) | BudgetLayout, BackToBudgets, NavItem, AccountGroup | `components/layout/budget-sidebar.tsx`, `nav-item.tsx`, `sidebar-account-group.tsx`, `back-to-budgets.tsx` |
| `budgets/balancing.tsx` (300) | BalancingPage, SplitTable, SplitSettings, plus the `budgetSelect` render function | `components/balancing/split-table.tsx`, `split-settings.tsx`, `budget-select.tsx`, `hooks/useHouseholdSplit.ts` |
| `budgets/$budgetId/accounts/all.tsx` (216) | AllAccountsRegister | No split needed. Move the query into `hooks/useAllAccountsRegister.ts` and the state into the URL search (M9) |
| `index.tsx`, `budgets/index.tsx`, `reports/index.tsx`, `reports/$reportId.tsx`, `__root.tsx` | 1 each | None. `LinkCard` (L4) and a report registry (L3) |

## Shared components to create (from H1 to M10)
`components/common/`: `inline-name-edit`, `field`, `section-heading`, `side-panel` (with `PanelSection`), `confirm-dialog`, `page-loading`, `page-header`, `error-list`, `reorder-arrows`, `money` (with `OutflowInflowCells`), `payee-combobox`, `category-combobox`, `date-picker-button`, `month-nav`, `link-card`. Add `xs`, `destructive-outline` and `subtle` variants to `buttonVariants`.
