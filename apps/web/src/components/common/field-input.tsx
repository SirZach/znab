import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/common/field-styles";

/** A bordered native input. Width comes from the caller (`w-full`, `flex-1`). */
export function FieldInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}
