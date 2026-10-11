/**
 * The two looks a native form control takes in this app. Kept as class strings
 * rather than folded into `ui/input`, whose shadcn base styles differ.
 */

/** A bordered box: side panels, forms and pickers. */
export const fieldClass =
  "rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

/** Only a bottom rule: inline in a register row or a panel band. */
export const underlineFieldClass =
  "bg-transparent border-b border-border focus:outline-none focus:border-primary text-sm w-full px-1 py-0.5";
