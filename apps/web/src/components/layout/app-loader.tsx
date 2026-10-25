/**
 * Full-screen logo pulse. index.html paints the same markup before the bundle
 * runs and owns the `app-loader` styles, so the hand-off to React is seamless.
 */
export function AppLoader() {
  return (
    <div className="app-loader" role="status" aria-label="Loading ZNAB">
      <img src="/favicon.svg" alt="" width={64} height={64} />
    </div>
  );
}
