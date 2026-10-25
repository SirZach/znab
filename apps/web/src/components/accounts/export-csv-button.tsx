import { useState } from "react";
import { Download } from "lucide-react";
import { ActionButton } from "@/components/common/action-button";
import { apiOrigin, authHeaders } from "@/trpc";

/** The filename the server suggests, or a plain fallback when none comes through. */
function filenameFrom(res: Response) {
  const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
  return match?.[1] ?? "transactions.csv";
}

/**
 * Downloads every transaction in the budget as CSV. A plain link cannot send
 * the header that says who is asking, so the file is fetched with it and
 * handed to the browser as a blob.
 */
export function ExportCsvButton({ budgetId }: { budgetId: number }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch(`${apiOrigin}/export/${budgetId}/transactions.csv`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(res);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-destructive">{error}</span>}
      <ActionButton
        variant="outline"
        onClick={exportCsv}
        disabled={isExporting}
        title="Every transaction in the budget, as CSV"
        className="inline-flex items-center gap-1.5"
      >
        <Download className="size-4" />
        {isExporting ? "Exporting…" : "Export CSV"}
      </ActionButton>
    </div>
  );
}
