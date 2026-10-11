/**
 * The register is three stacked tables, the header, the rows and the add row,
 * and they only line up if every one of them resolves its columns identically.
 *
 * Sharing this colgroup was not enough on its own, because the tables laid out
 * automatically: three of the columns carried no width, so each table sized
 * those to its own contents, the header to the word Payee, the rows to real
 * payee names, the add row to its inputs. Three answers and three sets of
 * column edges. The widths on the rest were hints under that layout rather than
 * instructions, so they drifted too.
 *
 * Every column now has a width and the tables are laid out fixed, which is what
 * makes a colgroup binding rather than advisory. The widths are proportions so
 * they hold at any width the window is, and they sum to 100.
 *
 * Memo is the narrowest of the three that hold words, deliberately. It is the
 * least important thing on a row and the emptiest: 120 of the 10,527
 * transactions in the largest budget carry one at all. Payee and category are
 * what a register is read for, so the width goes there and a long memo ends in
 * an ellipsis rather than pushing everything else about.
 */
export function RegisterColgroup() {
  return (
    <colgroup>
      <col className="w-[2%]" />
      <col className="w-[9%]" />
      <col className="w-[27%]" />
      <col className="w-[23%]" />
      <col className="w-[9%]" />
      <col className="w-[9%]" />
      <col className="w-[9%]" />
      <col className="w-[3%]" />
      <col className="w-[9%]" />
    </colgroup>
  );
}
