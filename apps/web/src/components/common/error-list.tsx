import { cn } from "@/lib/utils";

/**
 * A band of error lines under a page header. Empty entries are dropped, and
 * nothing renders when none are left.
 */
export function ErrorList({
  messages,
  className,
}: {
  messages: readonly (string | null | undefined)[];
  className?: string;
}) {
  const shown = messages.filter((m): m is string => !!m);
  if (shown.length === 0) return null;
  return (
    <div className={cn("px-6 py-2 border-b border-border", className)}>
      {shown.map((message, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: messages may repeat and the list is never reordered
        <p key={i} className="text-xs text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
