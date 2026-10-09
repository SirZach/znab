# UI primitives guide (phase 5 stage A)

All in `apps/web/src/components/common/` unless noted. Rule: zero visual change.

- Fields: `FieldInput`, `FieldSelect` (or `fieldClass` from `field-styles.ts` for odd cases), `UnderlineInput`. Money: `<MoneyInput variant="boxed|underline" onEnter={(amount) => ...} />`.
- Buttons: primary string `rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors` becomes `<ActionButton>`; muted outline `variant="outline"` (add `className="px-3"` where used); red outline `variant="destructive"`; `outline-danger`. All default `type="button"`; keep `type="submit"` inside forms. `IconButton`, `CloseIconButton onClick label?`. shadcn `Button size="xs"` replaces `size="sm" className="h-6 px-2 text-xs"`.
- Panels: `<SidePanel className="w-96?">`, `<SidePanelHeader title subtitle onClose titleClassName="truncate" />`, `<SidePanelSection title bordered={false on last}>`, `SectionHeading`.
- `<ConfirmDialog open onOpenChange title description confirmLabel onConfirm variant? />`, keep mounted.
- `<PageHeader title subtitle className>{children}</PageHeader>`, `<CenteredMessage className="h-full">`, `<ErrorList messages={[...]} />` (payees band uses text-sm, differs).
- `<NameInput initial aria-label onCommit onCancel />`; caller checks empty or unchanged.
- `<SegmentedControl options value onChange variant="primary|subtle|pill" />`, `StatRow`.
- Reports: `components/reports/report-layout.tsx`, `timeframe-toggle.tsx`, `summary-stat.tsx`, `lib/chart.ts`.
- Tokens: `text-success`, `text-warning`, `--chart-1..4`.
- After routes are typed, set biome `a11y/useButtonType` to error.
