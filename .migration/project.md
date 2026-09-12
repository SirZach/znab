# project

2026-09-11 — whole-project Radix UI → Base UI migration of `apps/web`. All three radix packages removed; `tsc --noEmit` and `vite build` both clean. **0 wrappers remain on Radix.**

## Preflight

| Check | Result |
| --- | --- |
| shadcn config | `apps/web/components.json`, style **`default`** (legacy, unprefixed), tsx, tailwind v4, cssVariables, baseColor slate, ui alias `@/components/ui` |
| Package manager | **bun** (`bun.lock` at repo root; bun 1.4.2) |
| Git | clean tree, branch `worktree-radix-to-base`, one commit per component |
| Baseline | `vite build` ✅, `tsc --noEmit` ✅ (see note below) |
| Radix surface | 3 packages, 4 files |

Baseline note: the first `tsc --noEmit` in a fresh worktree reported 11 errors across 8 route
files, all `createFileRoute(...)` argument mismatches. These were **not pre-existing failures in
your checkout** — `apps/web/src/routeTree.gen.ts` is gitignored and had not been generated yet.
Running `vite build` once generated it and the baseline went green. Nothing was attributed to the
migration on that basis.

## Dependency swap

Installed alongside radix first, removed radix only after the last component was migrated:

- **Added** `@base-ui/react@1.8.0` (`apps/web/package.json`).
- **Removed** `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-slot`.
- Lockfile updated with bun (the project's own package manager); no stale lockfile left behind.

Note: the worktree started without `node_modules` and without `bun.lock` (gitignored), so the
lockfile was copied from the main checkout before installing to keep resolution faithful to yours.

## Components

Migrated bottom-up, leaf/shared wrappers first. One report each:

| Component | Classification | Strategy | Report |
| --- | --- | --- | --- |
| `button.tsx` | pristine stock | engine → real `@base-ui/react/button` primitive | `.migration/button.md` |
| `dialog.tsx` (+ `command.tsx` type) | pristine stock | engine, `Overlay→Backdrop`, `Content→Popup` | `.migration/dialog.md` |
| `popover.tsx` (+ 3 call sites) | pristine stock | engine, `Content→Portal>Positioner>Popup` | `.migration/popover.md` |

All three wrappers were byte-identical to their stock `default`-style origins apart from a removed
`"use client"` line, so no user customizations had to be replayed.

## Why the engine and not the CLI golden pair

`components.json` style is **`default`** — a legacy unprefixed style. There is no `base-default`
variant in the registry, so retargeting these files onto a `base-<style>` variant would have
restyled the app. Per the skill's legacy-style rule, the stock radix goldens were fetched for
**classification only**, and the transformation engine was then run on your own files, keeping your
exact class strings. The shipped `base-lyra` variants were read purely as a shape reference
(Positioner classes, prop forwarding, data-attribute idiom) and never merged in.

One finding worth recording: the real shadcn base registry **keeps** the `animate-in`/`animate-out`
utilities and only renames the state hooks (`data-[state=open]:` → `data-open:`). It does not
convert them to `data-starting-style:` transitions as `class-mapping.md` suggests. The registry
approach was followed, because it both matches the shipped base registry and preserves your exact
animations — `tw-animate-css` is already a dependency.

## App-code sweep

The consumer break surface here was small and is fully closed:

- `asChild` → `render`: 3 sites, all `PopoverTrigger`, all in
  `apps/web/src/routes/budgets/$budgetId/accounts/$accountId.tsx`.
- No call site used any other prop from `consumer-props.md` — no `Accordion type`, no
  `Tabs activationMode`, no `Select position`, no `TooltipProvider delayDuration`, no
  `Separator decorative`, no `Checkbox indeterminate`, no `Slider onValueCommit`. Those primitives
  are not installed in this project.
- Final repo-wide sweep across `apps/web/src` for `@radix-ui`, `radix-ui`, `asChild`,
  `data-[state=` and `--radix-` returns **zero matches**. The only remaining occurrence of the
  string "radix" anywhere in tracked files is the migration skill's own name in `skills-lock.json`.

## Left alone (intentionally, not radix)

- `apps/web/src/components/ui/command.tsx` — **cmdk**. Only its radix `DialogProps` type import was
  rewired; every cmdk part and `[cmdk-*]` selector is untouched.
- `apps/web/src/components/ui/calendar.tsx` — **react-day-picker**.
- `recharts` (charts) — not radix, no wrapper in `ui/`.
- No `drawer.tsx` (vaul), `sonner`, or `input-otp` in this project.

## Final verification

| Step | Result |
| --- | --- |
| `tsc --noEmit` after each file | clean at every step |
| `tsc --noEmit` after radix removal | clean |
| `vite build` (final) | ✅ built, 0 errors |

Build output grew from ~1,050 kB to ~1,123 kB raw (315 → 340 kB gzip). The pre-existing
"chunks larger than 500 kB" warning is unchanged and unrelated.

## Flagged, not fixed

1. **`components.json` style is still `default`.** The CLI reads that as a radix-era style, so a
   future `shadcn add <component>` will deliver a **radix** variant and reintroduce
   `@radix-ui/*` dependencies. There is no `base-default` to switch to. Your options are to pick a
   prefixed `base-<style>` (which would restyle existing components) or to add future components
   by hand. This is your call — deliberately left alone.
2. **Popover transform-origin now applies.** The old `origin-[--radix-…]` class compiled to invalid
   CSS and was silently inert; the replacement is live. Popovers now scale from the trigger edge
   instead of their center. Details in `.migration/popover.md`.
3. **`asChild` is no longer part of `ButtonProps`.** Future polymorphic buttons use
   `render={<a />}` plus `nativeButton={false}`.
4. **Base UI Portals render an extra `<div>`** in both dialog and popover. Nothing here depends on
   it, but it changes the portal DOM shape.
5. **Collision padding defaults changed** `0` → `5` for popovers near viewport edges.

## Derived status

Scanning `apps/web/src/components/ui` for remaining radix imports: **0 wrappers remain on Radix.**
