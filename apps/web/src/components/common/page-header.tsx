import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The band across the top of a page: its title, a muted line under it, and
 * optionally controls beside them (`children`), laid out by `className`, e.g.
 * `flex flex-wrap items-center gap-4`.
 */
export function PageHeader({
  title,
  subtitle,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const heading = (
    <>
      <h2 className="text-xl font-semibold">{title}</h2>
      {subtitle !== undefined && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );
  return (
    <div className={cn("px-6 py-4 border-b border-border", className)}>
      {children === undefined ? (
        heading
      ) : (
        <>
          <div>{heading}</div>
          {children}
        </>
      )}
    </div>
  );
}
