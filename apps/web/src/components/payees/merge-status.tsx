/**
 * The band under the header for merge and rename outcomes. Its lines are
 * text-sm, so it is not `ErrorList`.
 */
export function MergeStatus({
  mergeError,
  renameError,
  mergeResult,
  targetName,
}: {
  mergeError: string | null;
  renameError: string | null;
  mergeResult: { movedTransactions: number; movedRenameRules: number } | null;
  /** The payee kept, while it is still selected. */
  targetName: string | null;
}) {
  if (!mergeResult && !mergeError && !renameError) return null;
  return (
    <div className="px-6 py-2 border-b border-border text-sm">
      {mergeError && <p className="text-destructive">{mergeError}</p>}
      {renameError && <p className="text-destructive">{renameError}</p>}
      {mergeResult && (
        <p className="text-muted-foreground">
          Merged{targetName !== null ? ` into "${targetName}"` : ""}, moving{" "}
          {mergeResult.movedTransactions} transactions and {mergeResult.movedRenameRules} rename
          rules.
        </p>
      )}
    </div>
  );
}
