/** What the last Enter all due sweep did. */
export type EnterDueResult = {
  entered: number;
  schedules: number;
  cappedOut: boolean;
  skipped: readonly { reason: string }[];
};

/** Reports back what the last sweep entered, and what it passed over. */
export function EnterDueSummary({ result }: { result: EnterDueResult }) {
  return (
    <div className="px-6 py-2 border-b border-border">
      <p className="text-xs text-muted-foreground">
        Entered {result.entered} transaction
        {result.entered === 1 ? "" : "s"} across {result.schedules} schedule
        {result.schedules === 1 ? "" : "s"}.
        {result.cappedOut
          ? " Some schedules are still behind. Press Enter all due again to keep going."
          : ""}
      </p>
      {/* One schedule that cannot be entered no longer stops the rest, so what
          was passed over is named rather than silently left behind. */}
      {result.skipped.length > 0 && (
        <p className="mt-1 text-xs text-destructive">
          {result.skipped.length} could not be entered:{" "}
          {result.skipped.map((s) => s.reason).join(" ")}
        </p>
      )}
    </div>
  );
}
