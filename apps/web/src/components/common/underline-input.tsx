import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { underlineFieldClass } from "@/components/common/field-styles";

/** A native input with only a bottom rule, for typing inside a row. */
export function UnderlineInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(underlineFieldClass, className)} {...props} />;
}
