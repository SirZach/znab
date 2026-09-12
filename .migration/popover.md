# popover

2026-09-11. Transformation engine (legacy style `default`, classification only, no golden replay). `Content` split into `Portal > Positioner > Popup`, three `asChild` call sites rewritten to `render`; typecheck and production build clean.

## Changed

- Classification first: `apps/web/src/components/ui/popover.tsx` diffed against
  `https://ui.shadcn.com/r/styles/default/popover.json`. Only the removed `"use client"` line
  differed, so the wrapper was **pristine** and nothing needed replaying. Style `default` is legacy
  with no `base-default` counterpart, so the user's own file was transformed and its classes kept.
  The target shape was cross-checked against the shipped base registry
  (`https://ui.shadcn.com/r/styles/base-lyra/popover.json`).
- `popover.tsx:1`: `import * as PopoverPrimitive from "@radix-ui/react-popover"` becomes
  `import { Popover as PopoverPrimitive } from "@base-ui/react/popover"`.
- `popover.tsx:8-40`: the biggest structural change. Radix's `Portal > Content` (with positioning
  props on Content) became `Portal > Positioner > Popup`. The Positioner is the positioned element
  and carries `className="isolate z-50"`; the Popup keeps `z-50` and all the visual classes, exactly
  as the base registry does it.
- `popover.tsx:11-20,25-29`: **the FORWARD rule applied in full, declare then destructure then
  forward.** All four positioning props (`align`, `alignOffset`, `side`, `sideOffset`) are declared
  via `Pick<PopoverPrimitive.Positioner.Props, …>`, destructured, and passed explicitly to
  `<PopoverPrimitive.Positioner>`. This matters: previously `side` and `alignOffset` reached radix's
  Content through `...props`; had they been left in `...props` now they would have silently landed
  on the Popup, which is the wrong DOM node, and positioning would break with no type error.
  Defaults kept the caller-visible behavior: `align="center"`, `sideOffset={4}` (as before), plus
  `alignOffset={0}`, `side="bottom"` (Base UI's own defaults).
- `popover.tsx:32`: class rewrites on the Popup. `data-[state=open]:` becomes `data-open:` and
  `data-[state=closed]:` becomes `data-closed:`. The `data-[side=…]:slide-in-from-*` classes are
  kept parameterized and unchanged (Base UI still emits `data-side` on the Popup). All
  `animate-in`/`animate-out`/`fade`/`zoom` utilities preserved verbatim.
- `popover.tsx:32`: CSS variable rewrite. `origin-[--radix-popover-content-transform-origin]`
  becomes `origin-(--transform-origin)`. See Behavior changes: this one is not cosmetic.
- Props typed `Omit<PopoverPrimitive.Popup.Props, "className"> & { className?: string }` for the
  same `cn()`/state-callback reason as dialog.
- `apps/web/src/routes/budgets/$budgetId/accounts/$accountId.tsx`: the three consumer call sites
  (previously `:213`, `:238`, `:284`) rewritten from `asChild` to `render`. Per the worked example,
  the `<Button>` moves into `render={<Button … />}` as a **self-closing** element and its former
  children become children of `<PopoverTrigger>`:
  - date picker trigger, where `<CalendarIcon/>` and the formatted date are now children of the
    trigger;
  - payee combobox trigger;
  - category combobox trigger, which also forwards `ref={categoryTriggerRef}` on the Button inside
    `render`. The ref still resolves, and the
    `setTimeout(() => categoryTriggerRef.current?.focus())` hand-off from the payee popover still
    typechecks.
- Leftover scan clean: `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/popover.tsx 'apps/web/src/routes/budgets/$budgetId/accounts/$accountId.tsx'`
  returns no matches. A repo-wide sweep for `asChild`, `data-[state=`, `--radix-` and `@radix-ui`
  across `apps/web/src` also returns nothing.

## Left alone

- `apps/web/src/components/ui/command.tsx` is rendered *inside* two of these popovers, but it wraps
  cmdk, which is not radix. Its only radix tie (a `DialogProps` type import) was handled as part of
  the dialog migration; see `.migration/dialog.md`.
- `apps/web/src/components/ui/calendar.tsx` is rendered inside the date popover and wraps
  `react-day-picker`, not radix. Untouched by hard rule.
- Popover `Anchor`: the wrapper never exposed it, so the dropped-part workaround (Positioner's
  `anchor` prop) was not needed.

## Behavior changes

- **The popover's transform origin now actually works.** The old class emitted
  `transform-origin:--radix-popover-content-transform-origin`, a bare custom-property name, which
  is not a valid CSS value, so browsers dropped the declaration and the zoom animation originated
  from the element's center. (Confirmed empirically: Tailwind v4 compiles the v3-era `origin-[--var]`
  bare form to that invalid value.) The new `origin-(--transform-origin)` compiles to
  `transform-origin:var(--transform-origin)`, verified present in the built CSS, so the popover
  now scales from the edge nearest its trigger. **This is a real, intentional visual change.**
- **`isolate` on the Positioner creates a new stacking context.** Matches the base registry, but
  anything that relied on the popover's children escaping the `z-50` context (there is nothing
  today) would be affected.
- **Collision defaults shifted.** Base UI's Positioner defaults `collisionPadding` to `5`
  (radix: `0`) and `arrowPadding` to `5` (radix: `0`). Popovers near a viewport edge may sit a few
  pixels further from it than before.
- **Portal renders an extra `<div>`** where Radix's rendered nothing. No CSS here depends on it.
- **`onOpenChange` signature widened** to `(open, eventDetails)`. The two controlled popovers
  (`setPayeeOpen`, `setCategoryOpen`) pass single-argument setters, which remain correct.
- **Trigger gained hover-open capability** (`openOnHover`, `delay`, `closeDelay`), all opt-in and
  off by default, so there is no change in behavior unless enabled.
- **`data-state` is gone from the trigger**; it is now `data-popup-open` (plus `data-pressed`).
  No selector in this repo targets it.

## Verify by hand

1. On an account page's add-transaction row, click the date cell. The popover should open below
   the trigger, left-aligned (`align="start"`), and the calendar should be fully visible.
2. Watch the open animation closely: it should now scale from the top edge nearest the trigger
   rather than from its center. This is the intended fix, but confirm it looks right.
3. Pick a date; confirm the popover closes and the formatted date appears in the trigger.
4. Click the payee cell, type to filter, and select a payee with the keyboard (arrows plus Enter).
   Confirm focus then jumps automatically to the category trigger.
5. The category popover opens on focus (`onFocus={() => setCategoryOpen(true)}`). Tab into it and
   confirm it still auto-opens, filters, and closes on select.
6. Press `Escape` in an open popover; confirm it closes and focus returns to the trigger.
7. Scroll the transaction list with a popover open and confirm it stays anchored to its trigger.
8. Narrow the window so a popover would overflow the right edge; confirm it flips/shifts to stay
   on screen.
