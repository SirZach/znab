# Phase 5 review (590b4ad..HEAD, task/cqr-phase5-primitives)

Read-only regression hunt. `bun run check` passes (typecheck, biome, 287 web, 167 api, 40 shared, 40 db tests).

Verdict: no regressions in rendered classes, handlers or hook semantics. Two minor findings, both
in areas that changed on purpose. Nothing blocks merge.

## Findings

### 1. All Accounts: search pushes history, and Back leaves the search box stale (Minor, CONFIRMED)
`apps/web/src/routes/budgets/$budgetId/accounts/all.tsx:63-66`

- Before: `q` lived in component state. Search never touched history.
- Now: `onSearch` calls `navigate({ search: ... })` with no `replace`, so every settled search
  (250 ms debounce, `register-search.tsx:9`) pushes a history entry. The account register does
  the same thing with `replace: true`, on purpose (`$accountId.tsx:268-273`, "typing a word
  should not put five entries in the history").
- `RegisterSearch` seeds its local `text` from `value` only once (`register-search.tsx:30`).
  Type "rent", then press Back: the URL loses `q` and the table shows everything, but the box
  still says "rent". It also has no match count, because `matches` is null when `q` is unset.
- Fix: pass `replace: true` in the All Accounts `onSearch`. To make Back resync too, have
  `RegisterSearch` reset `text` when the `value` prop changes. Do this during render
  (`if (value !== lastValue) { setLastValue(value); setText(value); }`), not by keying it on
  `q`. Keying would remount the box after its own search settles and lose focus.
- Related, low impact: the sidebar's "All Accounts" link has no `search`, so clicking it while
  filtered now resets every filter. Before, the state survived. This is probably acceptable as a
  side effect of moving the filters into the URL. Note it in the PR.

### 2. Payee autofill: the "saved category is hidden" note sticks after saving (Minor, CONFIRMED)
`apps/web/src/components/payees/autofill-section.tsx:29,57`

- Before: `savedCategoryHidden` was worked out on every render from the live `payee` and
  `categoryOptions`.
- Now: it is read from `useState(() => autofillDraft(...))`, so it is fixed at mount. Saving
  with the hidden category cleared refetches the payee (`autofillCategoryId` becomes null), but
  "This payee's saved category is hidden, so saving clears it." stays on screen until the panel
  remounts. Before, it disappeared.
- Fix: keep `useState` for seeding the drafts only. Work out the flag on every render:
  `const { savedCategoryHidden } = autofillDraft(payee, categoryOptions);`

## Areas checked, no regressions

- Primitive class output, after tailwind-merge: ActionButton (every variant, plus overrides
  `px-3`, `text-xs px-2 py-1`, `w-full`, `flex-1`), SidePanel (`w-96` beats `w-80`),
  SidePanelHeader, SidePanelSection (borders and `space-y-2`), PageHeader (with and without
  children), FieldInput, FieldSelect, MoneyInput (boxed and underline; `w-28` beats `w-full`
  on the reconcile field), UnderlineInput, SegmentedControl (primary, subtle, pill), StatRow
  (`text-success`/`text-warning` resolve as colors, not sizes), CenteredMessage, ErrorList,
  IconButton, CloseIconButton, LinkCard, `Button size="xs"`. All match the old strings. The
  merge bar's ActionButton adds `text-sm`, which the bar already inherits.
- Props and handlers: refs pass through as props (React 19), and `autoFocus`, `onKeyDown`,
  `disabled`, `title`, `aria-*` and placeholder overrides reach MoneyInput. Keys are kept on
  EditCells, CategoryInspector, AccountInspector, PayeeInspector, SplitSettings and the
  ScheduleForm in the edit panel. The app has no `<form>`, so making every button
  `type="button"` changes nothing.
- ConfirmDialog swaps: closing before `onConfirm` is safe everywhere, because each `onConfirm`
  reads its subject (`doomed`, `warningId`) from the render closure. Mount-on-demand versus
  always-mounted matches the old code at every call site. Reconcile's `finish` already closed
  its dialog.
- Register hooks: query inputs, `invalidateMoney` on every write, the create path (scroll,
  clear, refocus, drop `txn`), the error precedence for upcoming and edit, and the Escape
  listener all match. The `useRegisterPages` render-time reset is correct, and better than
  before: the new view no longer fetches using the old view's page count. Selection anchor
  behavior matches `selectRows` exactly, in both the register and the budget grid (clearing
  keeps the anchor, as before).
- BudgetedCell: removing the effect matches the old behavior for focus, Enter/Arrow moves,
  blur, Escape, an unreadable entry and +/- adjust (`shown` equals what the effect used to
  force). Typing after Enter on the last cell now resumes editing explicitly, which fixes an old
  case where a refetch could overwrite text being typed.
- Route splits (budget, accounts, categories, payees, scheduled, balancing, reports, sidebar):
  conditional order, loading and empty states, and early returns are kept. Chart colors map to
  the same hex values.
