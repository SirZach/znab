# button

2026-09-11 — transformation engine (legacy style `default`, classification only, no golden replay). Migrated to the real `@base-ui/react/button` primitive; typecheck and production build clean.

## Changed

- `apps/web/src/components/ui/button.tsx:2` — `import { Slot } from "@radix-ui/react-slot"` →
  `import { Button as ButtonPrimitive } from "@base-ui/react/button"`. Base UI ships a real
  Button primitive that accepts `render` natively, so this is NOT a hand-rolled
  `useRender`/`mergeProps` wrapper (that idiom is reserved for non-button polymorphic parts).
- `button.tsx:36-40` — `ButtonProps` no longer declares `asChild?: boolean`. It now extends
  `Omit<ButtonPrimitive.Props, "className">`, which supplies `render`, `nativeButton` and
  `focusableWhenDisabled`. `className` is re-declared as `string` because Base UI widens it to
  `string | ((state) => string | undefined)`, which `cva()` cannot accept.
- `button.tsx:42-52` — the `const Comp = asChild ? Slot : "button"` switch is gone; the component
  renders `<ButtonPrimitive>` unconditionally. `React.forwardRef<HTMLButtonElement>` is kept to
  match the rest of this repo's `ui/` files, and typechecks against the primitive's `HTMLElement`
  ref without a cast.
- `buttonVariants` (the entire `cva` block, classes and variant names) is byte-for-byte unchanged.
  There are no radix data-attribute or CSS-variable hooks in the button class strings, so
  `class-mapping.md` had nothing to rewrite here.
- Leftover scan clean: `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/button.tsx` → no
  matches.

## Left alone

- `apps/web/src/components/ui/calendar.tsx` — consumes `Button` and `buttonVariants` and passes a
  `React.useRef<HTMLButtonElement>` at `calendar.tsx:181,187`. Both still typecheck unchanged, so
  the file was not touched. `calendar.tsx` itself wraps `react-day-picker`, which is not radix and
  is out of scope by the skill's hard rules.
- No call site anywhere in `apps/web/src` used `<Button asChild>`, so dropping `asChild` required
  no consumer edits.

## Behavior changes

- **`asChild` is gone from the public `ButtonProps`.** Any future `<Button asChild><a/></Button>`
  must be written `<Button render={<a />} nativeButton={false} />`. Nothing in the repo used it
  today, so this is a latent API change, not a live regression.
- **Disabled styling hook.** Base UI Button exposes `data-disabled` in addition to the native
  `disabled` attribute. The existing `disabled:pointer-events-none disabled:opacity-50` classes
  still apply because the primitive renders a native `<button>` by default (`nativeButton: true`).
  If a `render` target is ever swapped to a non-button element, those `disabled:*` variants go
  dead and must become `data-disabled:*`.

## Verify by hand

1. Open any page with buttons; confirm all six variants (default/destructive/outline/secondary/
   ghost/link) and four sizes look identical to before.
2. Tab to a button — the `focus-visible:ring-2` ring should appear exactly as before.
3. Open the transaction row on an account page and confirm the calendar day buttons (which pass a
   ref through `Button`) still highlight and respond to clicks.
4. Confirm a disabled button is both visually dimmed and non-clickable.
