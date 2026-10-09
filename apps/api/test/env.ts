/**
 * Where the router tests run. Never the dev database: that one is rewritten by
 * the YNAB sync every 15 minutes, and a test pointed at it would race the sync.
 * The default is the docker-compose Postgres with its committed dev login.
 */
export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://znab:znab@localhost:5432/znab_test";
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test", got "${name}"`
    );
  }
  return url;
}
