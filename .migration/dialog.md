# dialog

2026-09-11. Transformation engine (legacy style `default`, classification only, no golden replay). `Overlay` becomes `Backdrop` and `Content` becomes `Popup` with no Positioner (centered modal); typecheck and production build clean.

## Changed

- Classification first: `apps/web/src/components/ui/dialog.tsx` was diffed against its stock origin
  `https://ui.shadcn.com/r/styles/default/dialog.json` (`files[0].content`). The only difference was
  the removed `"use client"` directive, so the wrapper was **pristine** and no customizations needed
  to be replayed. Because `default` is a legacy unprefixed style with no `base-default` counterpart,
  the user's own file was transformed in place and its classes kept verbatim; retargeting onto a
  `base-<style>` variant would have restyled the app.
- `dialog.tsx:2`: `import * as DialogPrimitive from "@radix-ui/react-dialog"` becomes
  `import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"` (namespace import becomes a
  named import; one subpath).
- `dialog.tsx:15-29`: `DialogPrimitive.Overlay` becomes `DialogPrimitive.Backdrop`. The **exported
  name `DialogOverlay` is deliberately unchanged** so consumers keep working.
- `dialog.tsx:31-58`: `DialogPrimitive.Content` becomes `DialogPrimitive.Popup`. Per the overlays
  reference, a centered modal uses Popup with **no Positioner**; the `Portal > Overlay + Popup`
  nesting is otherwise identical to the radix original.
- Data-attribute rewrites across every class string, matching the shipped shadcn base registry
  (verified against `https://ui.shadcn.com/r/styles/base-lyra/dialog.json`, which keeps the
  `animate-in`/`animate-out` utilities and only renames the state hooks):
  `data-[state=open]:` becomes `data-open:` and `data-[state=closed]:` becomes `data-closed:` on
  the backdrop (`:23`), the popup (`:42`) and the close button (`:50`). Every animation utility
  (`animate-in`, `fade-in-0`, `zoom-out-95`, `slide-in-from-top-[48%]`, and the rest) is preserved
  unchanged, so the dialog animates exactly as it did. `tw-animate-css` is already a dependency.
- `dialog.tsx` part wrappers converted from `React.forwardRef` to plain function components using
  `DialogPrimitive.<Part>.Props`, matching the base registry shape. This is ref-transparent on
  React 19 (ref is an ordinary prop and flows through `...props`). `DialogHeader`/`DialogFooter`
  remain untouched plain `<div>`s with their original classes.
- Each part's props are typed `Omit<DialogPrimitive.<Part>.Props, "className"> & { className?: string }`
  because Base UI widens `className` to a state callback that `cn()` cannot consume.
- `apps/web/src/components/ui/command.tsx:4`: `import { type DialogProps } from "@radix-ui/react-dialog"`
  becomes `import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog"`. This was the
  last radix *type* import in the tree.
- `command.tsx:26-30`: added `CommandDialogProps = Omit<DialogPrimitive.Root.Props, "children"> & { children?: React.ReactNode }`.
  Base UI's `Root.Props["children"]` is `PayloadChildRenderFunction<unknown> | ReactNode`, which
  cmdk's `<Command>` rejects (`TS2322`). Narrowing keeps `CommandDialog`'s public API exactly what
  it was before the migration.
- Leftover scan clean: `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/dialog.tsx apps/web/src/components/ui/command.tsx`
  returns no matches.

## Left alone

- `apps/web/src/components/ui/command.tsx`, specifically the cmdk parts (`CommandPrimitive`,
  `CommandInput`, `CommandList`, `CommandItem`, all `[cmdk-*]` selectors). cmdk is not radix and is
  untouchable under the skill's hard rules; only the radix `DialogProps` type import and the
  resulting children type were rewired.
- `DialogHeader` and `DialogFooter`, plain `<div>` layout helpers with no radix involvement.

## Behavior changes

- **`onOpenChange` signature widened.** Radix `(open: boolean) => void` becomes Base UI
  `(open, eventDetails) => void`. Existing single-argument handlers stay type-safe and behave the
  same; no call site in this repo used the second argument.
- **Dismissal callbacks no longer exist.** `onEscapeKeyDown`, `onPointerDownOutside` and
  `onInteractOutside` have no Base UI equivalent. They are now `eventDetails.reason`
  (`'escape-key'` / `'outside-press'` / `'focus-out'`) plus `eventDetails.cancel()` inside
  `onOpenChange`. Nothing in this repo used them, so nothing was rewritten.
- **Focus props moved.** `onOpenAutoFocus` / `onCloseAutoFocus` become the Popup's `initialFocus` /
  `finalFocus`, which take an element/ref/callback rather than a preventable event. Unused here.
- **Portal renders an extra `<div>`.** Base UI's Portal wraps its children in a `<div>`; Radix's
  rendered nothing extra. Any CSS depending on a direct parent/child relationship through the
  portal boundary could be affected. No such selector exists in this codebase.
- **`data-state` is gone from the DOM.** External styling or tests keyed on
  `[data-state="open"]` for the dialog now need `[data-open]`. No occurrences remain in `src/`.
- **`CommandDialog` no longer accepts payload-render children.** Deliberate: cmdk cannot render a
  function child. This preserves the pre-migration API rather than widening it.

## Verify by hand

1. Open the command dialog (`CommandDialog`) and confirm it fades and zooms in exactly as before,
   centered, with the backdrop dimming the page.
2. Press `Escape`. The dialog should close and focus should return to whatever opened it.
3. Click the backdrop outside the dialog. It should close.
4. Click the `X` close button in the top-right; confirm its hover/focus ring still works.
5. With the dialog open, `Tab` repeatedly. Focus must stay trapped inside the dialog and cycle.
6. Confirm the page behind the dialog is scroll-locked while it is open.
