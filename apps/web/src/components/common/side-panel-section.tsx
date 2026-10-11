import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/section-heading";

/**
 * One section of a side panel, with an optional heading. The last section of a
 * panel passes `bordered={false}`.
 */
export function SidePanelSection({
  title,
  children,
  bordered = true,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-3", bordered && "border-b border-border", className)}>
      {title !== undefined && <SectionHeading className="mb-2">{title}</SectionHeading>}
      {children}
    </section>
  );
}
