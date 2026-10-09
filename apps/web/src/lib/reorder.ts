/**
 * The ids of `items` in order, with `a` and `b` swapped: what a reorder sends.
 * Swapping the pair where they sit in the whole order is what moves a row one
 * step on screen and leaves every other row where it was.
 */
export function swapIds(items: readonly { id: number }[], a: number, b: number) {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(a);
  const to = ids.indexOf(b);
  ids[from] = b;
  ids[to] = a;
  return ids;
}
