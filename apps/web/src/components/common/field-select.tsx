import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/common/field-styles";

/** A bordered native select, the partner of `FieldInput`. */
export function FieldSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, className)} {...props} />;
}
