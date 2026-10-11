import type { RegisterSort, SortDirection } from "@znab/shared";
import { RegisterColgroup } from "@/components/register/register-colgroup";
import { SortHeader } from "@/components/register/sort-header";

/** The sticky column headings over the register, each one a sort. */
export function RegisterColumnHeader({
  sort,
  dir,
  onSort,
}: {
  sort: RegisterSort;
  dir: SortDirection;
  onSort: (column: RegisterSort, dir: SortDirection) => void;
}) {
  const sortProps = { sort, dir, onSort };

  return (
    <table className="w-full table-fixed text-sm border-b border-border">
      <RegisterColgroup />
      <thead>
        <tr className="text-muted-foreground">
          {/* The flag has nothing to label: it is a colour and no more. */}
          <th className="pl-2 py-2" />
          <SortHeader column="date" label="Date" className="px-6" {...sortProps} />
          <SortHeader column="payee" label="Payee" className="px-4" {...sortProps} />
          <SortHeader column="category" label="Category" className="px-4" {...sortProps} />
          <SortHeader column="memo" label="Memo" className="px-4" {...sortProps} />
          {/* Outflow and Inflow are the two halves of one signed amount, so both
              head the same sort rather than two that cannot both exist. */}
          <SortHeader column="amount" label="Outflow" align="right" className="px-4" {...sortProps} />
          <SortHeader column="amount" label="Inflow" align="right" className="px-4" {...sortProps} />
          <SortHeader column="cleared" label="C" align="center" className="px-2" {...sortProps} />
          {/* Not sortable: it is a running total measured down the date order,
              so ordering by it would ask for the rows in the order of a number
              that only exists in another order. */}
          <th
            className="text-right px-6 py-2 font-medium"
            title={
              sort === "date"
                ? undefined
                : "Each row's balance as of its own date. Sorted by something other than date, the column no longer adds up down the page."
            }
          >
            Balance
            {sort !== "date" && <span className="ml-1 opacity-60">*</span>}
          </th>
        </tr>
      </thead>
    </table>
  );
}
