import { Fragment, useState } from "react";
import { InlineName } from "@/components/common/inline-name";
import { ReorderArrows } from "@/components/common/reorder-arrows";
import type { ManagedAccount } from "@/hooks/useAccounts";
import { accountSections, accountTypeLabel } from "@/lib/accounts";
import { swapIds } from "@/lib/reorder";
import { cn } from "@/lib/utils";

/**
 * The manage list, in the sidebar's sections. A section is a slice of the one
 * order the API keeps, so moving a row swaps it with its neighbour where the
 * pair sit in the whole set, and every other account stays put.
 */
export function AccountTable({
  accounts,
  inspectedId,
  onInspect,
  isReordering,
  onReorder,
  onRename,
}: {
  accounts: ManagedAccount[];
  inspectedId: number | null;
  onInspect: (id: number) => void;
  isReordering: boolean;
  onReorder: (accountIds: number[]) => void;
  onRename: (accountId: number, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <table className="w-full text-sm">
      <tbody>
        {accountSections(accounts).map((section) => (
          <Fragment key={section.label}>
            <tr>
              <th
                colSpan={3}
                className="text-left px-6 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {section.label}
              </th>
            </tr>

            {section.accounts.map((account, i) => (
              <tr
                key={account.id}
                onClick={() => onInspect(account.id)}
                aria-selected={account.id === inspectedId}
                className={cn(
                  "border-b border-border/50 cursor-pointer transition-colors",
                  account.id === inspectedId ? "bg-accent/60" : "hover:bg-accent/30"
                )}
              >
                <td className="w-20 px-6 py-2" onClick={(e) => e.stopPropagation()}>
                  <ReorderArrows
                    label={account.name}
                    up={section.accounts[i - 1]}
                    down={section.accounts[i + 1]}
                    onMove={(other) => onReorder(swapIds(accounts, account.id, other.id))}
                    disabled={isReordering}
                  />
                </td>

                <td className="px-2 py-2">
                  <InlineName
                    name={account.name}
                    editing={editingId === account.id}
                    aria-label="Account name"
                    onEdit={() => setEditingId(account.id)}
                    onCommit={(name) => {
                      setEditingId(null);
                      if (name && name !== account.name) onRename(account.id, name);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                  {account.note && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {account.note}
                    </span>
                  )}
                </td>

                <td className="px-6 py-2 text-right text-muted-foreground">
                  {accountTypeLabel(account.accountType)}
                  {!account.onBudget && <span className="ml-2 text-xs">tracking</span>}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
