/** A message under a register row, across the full width of the table. */
export function RowError({ message, className }: { message: string; className?: string }) {
  return (
    <tr className={className}>
      <td colSpan={9} className="px-6 pb-2">
        <p className="text-xs text-destructive">{message}</p>
      </td>
    </tr>
  );
}
