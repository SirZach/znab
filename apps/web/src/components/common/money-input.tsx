import type { ComponentProps } from "react";
import { cn, parseAmountExpression } from "@/lib/utils";
import { fieldClass, underlineFieldClass } from "@/components/common/field-styles";

const looks = {
  boxed: cn(fieldClass, "text-right tabular-nums"),
  underline: cn(underlineFieldClass, "text-right"),
};

/**
 * A money field. Text rather than a number input, since every money field in
 * the app takes arithmetic like `25+13`. `onEnter` is handed the amount when
 * Enter is pressed on something that reads as one; `onKeyDown` still sees
 * every key.
 */
export function MoneyInput({
  variant = "boxed",
  onEnter,
  onKeyDown,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type" | "value"> & {
  value: string;
  variant?: keyof typeof looks;
  onEnter?: (amount: number) => void;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key !== "Enter" || !onEnter) return;
        const amount = parseAmountExpression(props.value);
        if (amount !== null) onEnter(amount);
      }}
      className={cn(looks[variant], className)}
      {...props}
    />
  );
}
