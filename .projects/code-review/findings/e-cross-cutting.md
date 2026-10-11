# Chunk E: Cross cutting (tests, tooling, hygiene, architecture)

The pure logic is in good shape: `bun test` passes 258 tests in 16 files (45 ms), and `tsc --noEmit` is clean for `apps/web`, `apps/api`, `packages/db` and `packages/shared` under `strict` and `noUncheckedIndexedAccess`. All tests are lib unit tests. About 5,300 lines of money-moving API code have no tests: 8 routers (4,611 lines) and `scripts/import-yfull.ts` (674 lines), which re-imports every 15 minutes in production. No React component, hook or route has a test. None of this is enforced: there are no `test`, `typecheck` or `lint` scripts, no lint config, and `apps/web` `build` fails on a fresh clone. On the architecture side, the main cross-cutting gaps are no shared money module (cents conversion is written 8 times), the API and the web disagreeing on what "today" is (UTC vs local), cache invalidation lists maintained by hand in 5 hooks, and the web compiling API source to get its types.

## Coverage map

Excludes `components/ui`, `routeTree.gen.ts`, `vite-env.d.ts`, `styles/`. "Yes" means a sibling `*.test.ts` exists.

| File | Lines | Tests | Risk if untested |
| --- | ---: | --- | --- |
| **apps/api/src/lib** | | | |
| budget-math.ts | 405 | Yes | |
| schedule.ts | 303 | Yes | |
| ynab4-package.ts | 527 | Yes | |
| ynab4-mirror.ts | 86 | Yes | |
| payee-rename.ts | 71 | Yes | |
| account.ts | 64 | Yes | |
| household-split.ts | 47 | Yes | |
| reconcile.ts | 46 | Yes | |
| transfer.ts | 29 | Yes | |
| category.ts | 24 | Yes | |
| authz.ts | 88 | No | Medium (scoping correctness; security is reviewed separately) |
| **apps/api/src/routers** | | | |
| transaction.ts | 500 | No | 1: transfer pair create, update mirroring, delete |
| account.ts | 1007 | No | 2: opening balance, reconcile, register paging, delete |
| budget.ts | 637 | No | 3: raw SQL that feeds budget-math (`loadBudgetInputs`, `:85-130`), moveMoney, quickBudget |
| scheduled-transaction.ts | 712 | No | 4: enter, enterDue, skip, transfer schedules |
| (scripts) import-yfull.ts | 674 | Partial (only its lib helpers) | 5: production sync every 15 min, wipes znab edits |
| report.ts | 412 | No | 6: rounding math inside the router (`:109-204`, `:284-338`) |
| household-split.ts | 173 | No | 7: master budget cents sum (`:47`) |
| payee.ts | 556 | No | 8: merge, delete, rename rules |
| category.ts | 614 | No | 9: remove and move with reassignment |
| index.ts, trpc.ts, context.ts, routers/index.ts | 137 | No | Low (wiring) |
| **apps/web/src/lib** | | | |
| utils.ts, date-entry.ts, payee-autofill.ts, reconcile.ts, register-row.ts, schedule.ts | 660 | Yes | |
| **apps/web/src/hooks** | | | |
| useAccountRegister.ts | 418 | No | 10: mutations and invalidation for the register |
| useAccounts.ts, useCategories.ts, useScheduledTransactions.ts, usePayees.ts, useBudgetPage.ts | 598 | No | 13: hand-written invalidation lists |
| useBudgetLayout.ts, useBudgetList.ts, useBudgetMonths.ts, use-mobile.ts | 86 | No | Low |
| **apps/web/src/routes** | | | |
| budgets/$budgetId/accounts/$accountId.tsx | 1004 | No | 11: register editing UI |
| budgets/$budgetId/index.tsx | 910 | No | 12: budget table, inline budgeting |
| scheduled/index.tsx, payees.tsx, categories/index.tsx, accounts/index.tsx, accounts/all.tsx | 2966 | No | 14 |
| $budgetId.tsx, balancing.tsx, reports/*, budgets/index.tsx, index.tsx, __root.tsx | 897 | No | Low to Medium |
| **apps/web/src/components** | | | |
| register/row-fields.tsx, reconcile-panel.tsx, bulk-panel.tsx | 951 | No | 11 (money entry, reconcile) |
| budget/category-inspector.tsx, bulk-budget-panel.tsx | 762 | No | 12 |
| register/balances, cleared-filter, register-search, sort-header, upcoming-panel | 390 | No | Low |
| reports/*.tsx | 665 | No | Low (display of API numbers) |
| **apps/web/src (other)** | | | |
| trpc.ts, main.tsx, store/user.ts | 100 | No | Low |
| **packages** | | | |
| shared/src/schemas.ts | 130 | No | Medium: the `updateTransactionSchema` default trap (`:31-38`) has no regression test |
| shared/src/types.ts | 98 | Indirect (category.test.ts) | Low |
| db/src/** (schema, migrate) | 470 | No | Low (declarative) |

## Top 15 tests to write first

Items 1 to 13 use the API harness below. Item 14 is a pure unit test. Item 15 uses the web harness.

1. `transaction.create` transfer between two on-budget accounts: two rows, negated amounts, both `categoryId` null, the two rows linked by `transferTransactionId`, and the back payee created exactly once.
2. `transaction.create` transfer from on-budget to off-budget: the category lands on the on-budget side only.
3. `transaction.update` on one side of a transfer: amount, date and category mirror to the counterpart. Editing is refused when the counterpart is reconciled.
4. `transaction.delete` on a transfer: both sides are soft deleted, and the account balances return to their prior values.
5. `account.reconcile`: a balanced statement flips Cleared rows up to the statement date to Reconciled. An unbalanced one is refused without `adjustment`, and with it a "Reconciliation Balance Adjustment" row is written for the exact difference.
6. `account.create` with a starting balance: the opening row is categorized as income for on-budget accounts and has the right sign for credit cards. A future date is refused.
7. `budget.monthBudget` end to end on a seeded budget: To Be Budgeted, Available, and cash vs credit overspending carryover. This guards the SQL in `budget.ts:52-130` that budget-math trusts. Pin it to the proven YNAB 4 "Not Budgeted 0.00" numbers.
8. `budget.moveMoney`: total budgeted is unchanged and the two categories move by plus and minus the amount.
9. `scheduledTransaction.enterDue`: every due occurrence is entered once, the seed date advances, one-offs retire, and a transfer schedule writes a pair. Include a case at the date boundary (see finding H3).
10. `payee.merge`: transactions, scheduled transactions and rename rules repoint to the survivor, and a transfer payee is refused.
11. `category.remove` with reassignment: transactions and monthly budgets move to the target, and month totals are unchanged.
12. `report.spendingByCategory` and `incomeVsExpense` against `budget.monthBudget` on the same fixture: totals agree (this catches the transfer inclusion drift noted in chunk A).
13. Import idempotency: run `import-yfull` mirror mode twice on a small fixture `.ynab4` package. Row counts must be stable and znab-only settings (goals, Master Budget flags, household split) must survive. This needs `main()` split from the script's top-level code so a test can call it.
14. `updateTransactionSchema.parse({ id: 1 })` leaves `cleared` and `accepted` undefined. Money input with sub-cent or out-of-range values is rejected (once finding M1 lands).
15. Web: a register row where typing `25+13` in Outflow and pressing Enter calls `transaction.update` with `amount: -38`, and the category cell is disabled for an on-budget to on-budget transfer (`row-fields.tsx` plus `register-row.ts`).

## Recommended minimal test setup

**API (router and integration):**
- Keep `bun test` and add `apps/api/bunfig.toml` with `[test] preload = ["./test/setup.ts"]`. Run tests per package so the API preload and DB env never leak into web tests.
- Use a dedicated `znab_test` database, set in `apps/api/.env.test` (`bun test` sets `NODE_ENV=test` and loads `.env.test`). The dev DB is also written by the 15 minute YNAB sync, so tests there would race it. `setup.ts` runs the drizzle migrator once.
- Harness: `withCaller(async (caller, tx) => ...)` opens `db.transaction`, builds `appRouter.createCaller({ db: tx as unknown as typeof db, user, req: new Request("http://test") })`, runs the test body, then calls `tx.rollback()` and swallows `TransactionRollbackError`. Routers already go through `ctx.db` everywhere, and their own `ctx.db.transaction` calls become savepoints, so no router changes are needed. This formalizes the repo's existing "prove it in a rolled-back transaction" convention.
- Fixtures: write a small `seedBudget(tx)` builder (one user, budget, two on-budget accounts, one tracking account, a credit card, a few categories) instead of importing the full yfull files.

**Web (components and hooks):**
- Keep `bun test`. Add `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/dom` and `@testing-library/user-event` as dev deps, plus `apps/web/bunfig.toml` with `[test] preload = ["./test/happydom.ts"]` (calling `GlobalRegistrator.register()`). Bun already resolves the `@/` alias from tsconfig `paths`.
- Render with a real `trpc.Provider` and `QueryClient`, and replace `httpBatchLink` with a small custom `TRPCLink` that serves fixtures by path and records mutation inputs. This avoids msw and keeps tests independent of a DB.
- Vitest is the alternative if Vite plugin parity becomes necessary. It is not needed yet.

## High

### H1. No router, integration, hook or component tests on the money paths
`apps/api/src/routers/*.ts`, `apps/api/src/scripts/import-yfull.ts`, `apps/web/src/hooks`, `apps/web/src/components`
Every write that touches more than one row or table is untested: transfers, reconcile, opening balance, enterDue, merge, category removal, and the import. The same goes for the raw SQL that feeds the tested budget-math (`budget.ts:85-130`): a wrong JOIN or filter there yields wrong budget numbers while all 258 tests stay green. **Fix:** add the API harness above and write tests 1 to 13, then the web harness and test 15.

### H2. Nothing enforces typecheck or tests, and the web build fails on a fresh clone
`package.json:9-21`, `apps/web/package.json:8`, `.gitignore:13`
No package defines `test`, `typecheck` or `lint`, and there is no CI. `apps/web` `build` is `tsc && vite build`. `tsc` runs before the TanStack router plugin has generated `src/routeTree.gen.ts`, and that file is gitignored, so a clean checkout fails `bun run build` (the 11 `createFileRoute` errors recorded in `.migration/project.md:16-20`). **Fix:** commit `routeTree.gen.ts` (TanStack Router recommends this) and drop it from `.gitignore`, or change the build to `vite build && tsc --noEmit`. Add root scripts (see Tooling) and a pre-push hook or CI job that runs `bun run check`.

### H3. The API's "today" is UTC while the web's is local
`apps/api/src/routers/scheduled-transaction.ts:38-40` (used at `:410`, `:441`, `:659`), `apps/api/src/routers/account.ts:407`, `:555`, `:878` vs `apps/web/src/lib/utils.ts:55-66`, `apps/web/src/routes/budgets/$budgetId/accounts/index.tsx:458`
The API uses `new Date().toISOString().slice(0, 10)`, which is the UTC date. In US evenings UTC is already tomorrow. So `enterDue` enters tomorrow's scheduled transactions early, `upcoming` miscounts what is due, and the future-date guards on the opening balance and reconcile accept a date the web forbids. A default opening balance is also dated a day ahead (`account.ts:555`). **Fix:** add one `todayISO()` that formats in a configured zone (`TZ` env or a per-budget setting, via `Intl.DateTimeFormat("en-CA", { timeZone })`). Better still for `enterDue`, have the client send its local date. Cover it with test 9.

## Medium

### M1. No shared money module; floats on the wire, cents conversion written 8 times
`apps/api/src/lib/budget-math.ts:50`, `lib/reconcile.ts:16`, `lib/household-split.ts:18`, `routers/budget.ts:437,567,631`, `routers/household-split.ts:47`, `routers/report.ts:109-338`, `apps/web/src/lib/reconcile.ts:23`, `apps/web/src/lib/utils.ts:165,180`; schemas `packages/shared/src/schemas.ts:19,50,72`
Every layer re-rounds independently. The input schemas accept any `z.number()`, so sub-cent values are silently rounded by Postgres, and values past `NUMERIC(12,2)` surface as a 500 instead of a 400. Writes use `String(number)` (`transaction.ts:197`), which can produce exponent notation. **Fix:** add `packages/shared/src/money.ts` with `toCents`, `fromCents`, `sumCents` and a `moneySchema` (finite, at most 2 decimals, `|n| < 1e10`), and use it in every schema and helper listed above. Test it once (test 14).

### M2. Cache invalidation lists maintained by hand in 5 hooks
`apps/web/src/hooks/useAccountRegister.ts:126-155`, `useAccounts.ts:28-53`, `useCategories.ts:19-24`, `useBudgetPage.ts`, `useScheduledTransactions.ts`
Each money mutation lists by hand the queries it might affect, and `staleTime` is 30 s (`main.tsx:11`). The lists have already drifted. Register writes do not invalidate `budget.categoryHistory`, `budget.quickBudget`, `householdSplit.month`, `report.spendingByCategory`, `spendingByPayee` or `incomeVsExpense`, so those show stale numbers for up to 30 s after an edit. Meanwhile `useCategories.ts:23` invalidates `budget.monthData`, which no screen queries. **Fix:** one `invalidateMoney(utils)` helper covering budget, account, report, payee and schedule queries, used by every money mutation. At this app size `utils.invalidate()` is also acceptable.

### M3. The web compiles API source to get router types
`apps/web/src/trpc.ts:3-8`, `packages/db/src/index.ts:1-3`
The web imports `../../api/src/routers/index` and `../../api/src/routers/budget` by relative path. Its `tsc` therefore type-checks the whole API and DB package under the web tsconfig, which is why `packages/db` carries a `/// <reference types="bun" />` workaround. **Fix:** add a types-only entry (`apps/api/src/types.ts` exporting `AppRouter` and `RouterOutputs = inferRouterOutputs<AppRouter>`), depend on it as a workspace package (`"api": "workspace:*"`), and derive `MonthSummary` and the other output types from `RouterOutputs` instead of importing router modules.

### M4. The lockfile is gitignored and versions float
`.gitignore:7-8`, `apps/api/package.json:21`, `packages/db/package.json:17`, `packages/shared/package.json:11`
`bun.lock` exists at the root but is ignored. Combined with caret ranges on fast-moving majors (TypeScript 7, Vite 8, React 19) and `"@types/bun": "latest"` in three packages, installs on the production host are not reproducible. **Fix:** remove `bun.lock` and the stale `bun.lockb` lines from `.gitignore`, commit `bun.lock`, and pin `@types/bun`.

### M5. No lint or format tooling
No config anywhere, so unused code goes unnoticed (for example, two unused bindings in `routes/budgets/$budgetId/index.tsx:853,861`) and nothing checks hook rules. **Fix:** add Biome 2 (`bunx @biomejs/biome init`), which is a single binary in keeping with the Bun-first stack. Use the recommended rules plus `correctness/useExhaustiveDependencies`, `noUnusedImports` and `noUnusedVariables`. Ignore `apps/web/src/components/ui`, `routeTree.gen.ts` and `packages/db/migrations`. Either enable the formatter in one dedicated commit or leave it off. If the React Compiler style hook rules matter (`set-state-in-effect`, in line with "You Might Not Need an Effect"), add ESLint with only `eslint-plugin-react-hooks` for `apps/web`. Biome does not have those rules.

### M6. Setup docs disagree with the repo
`README.md:17`, `SETUP.md:7,34-40,140-162`
- Both docs tell a first-time user to run `bun db:generate`. Migrations 0000 to 0008 are committed, so this step is unnecessary, and it creates a stray migration if the schema has drifted. Remove the step from setup.
- `SETUP.md:7` says `./seed-data/` is "already present", but it is gitignored (`.gitignore:14`).
- The project tree lists routers as "budget, account, transaction" (there are 8) and omits `lib/`, `hooks/`, `components/` and `scripts/`.
- Neither doc mentions `bun test`, the production path (`bun run build`, `bun start` with `SERVE_WEB`, `scripts/znab.service`) or `scripts/restart-web.sh`.

**Fix:** update both docs and keep them short.

### M7. Dependency hygiene
- `apps/web/package.json`: `@tanstack/react-form` has 0 imports, so remove it. `zod` is not imported anywhere in `apps/web/src` (it arrives through `@znab/shared`), so remove it unless web will define schemas.
- `apps/api/package.json`: `postgres` is not imported in `apps/api/src` (only `packages/db` uses it), so remove it.
- `typescript` is declared only in `apps/web`. The API and packages rely on hoisting. Move it to root `devDependencies`.
- `@znab/shared` is resolved three ways in web: the workspace dep, `vite.config.ts:16` and tsconfig `paths`. The workspace `module` field is enough for Vite and Bun, so drop the alias and the path entry, or keep exactly one.

## Low

### L1. Tsconfig strictness can go one notch further cheaply
`tsconfig.base.json`
`strict` and `noUncheckedIndexedAccess` are already on. Adding `noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch` costs 2 errors in total (`routes/budgets/$budgetId/index.tsx:853,861`; the API is clean). Also add `noImplicitOverride`. `packages/db` and `packages/shared` set `outDir: "dist"` but are consumed as source and never built, so set `noEmit: true`.

### L2. Stray root files
- `znab_rebuild_plan.docx` (34 KB binary): an original planning doc, which cannot be reviewed in diffs. Move it to `.projects/rebuild/` or delete it.
- `.migration/`: reports from the completed 2026-09-11 Radix to Base UI migration. Move them to `.projects/radix-to-base/` or delete them.
- `skills-lock.json`, `.agents/skills/`, `.claude/skills` (symlinks into `.agents`): vendored agent skills (shadcn, migrate-radix-to-base). Fine if they are intentional. If not, gitignore them, since they bundle unrelated assets (`.agents/skills/shadcn/evals`, `agents/openai.yml`).

### L3. Drizzle snapshot gap
`packages/db/migrations/meta`
The snapshots for 0004 to 0006 are missing. `generate` diffs against 0008 and still works, but `drizzle-kit check` and history inspection will complain. Regenerate them or accept the gap knowingly.

### L4. packages/shared is used, but has dead exports and is missing what it should own
It is used by both apps (enums and zod schemas). Unused exports: `USER_SLUGS`, plus the inferred types `CreateTransaction`, `UpdateTransaction`, `SetBudgeted`, `CreateAccount` and `ReconcileAccount`. Meanwhile the income category ids are redeclared in `apps/api/src/lib/budget-math.ts:6-7` and hardcoded in `routers/report.ts:43`, next to `SPECIAL_CATEGORY_IDS` in `types.ts:84`. **Fix:** delete the dead exports, export the two income ids from shared, and give shared `money.ts` (M1).

### L5. Small script duplication
`package.json:20` (`cd apps/api && bun src/scripts/import-yfull.ts`) duplicates `apps/api/package.json` `import`. Use `bun run --filter api import`. `packages/db/src/index.ts:8-12` throws, and opens a pool, at import time when `DATABASE_URL` is unset. Keep pure lib modules free of `@znab/db` imports, as they are today, so unit tests stay DB free.

## Tooling: proposed root scripts

```json
"test": "bun run --filter '*' test",
"typecheck": "tsc --noEmit -p apps/api && tsc --noEmit -p apps/web && tsc --noEmit -p packages/db && tsc --noEmit -p packages/shared",
"lint": "biome check .",
"check": "bun run typecheck && bun run lint && bun run test"
```
Give each package `"test": "bun test"` so each one picks up its own `bunfig.toml` preload.

## Architecture overview

Data flows like this. A route component calls a `hooks/useX` wrapper around `trpc.*.useQuery` and `useMutation`. The `httpBatchLink` adds the `x-user-slug` header from the zustand store (`web/src/trpc.ts:28-37`). The request reaches Hono `/trpc/*` (`api/src/index.ts:33-39`). `createContext` resolves the user, `protectedProcedure` checks there is one, and the router procedure calls `assertBudgetAccess` and then works through `ctx.db` (drizzle, often inside `ctx.db.transaction`) plus pure functions in `api/src/lib` to reach Postgres. Types reach the web by relative import of API source (M3). Validation schemas and enums live in `packages/shared`.

Structural observations:
- Pure YNAB rules (budget math, schedules, reconcile, transfer naming, YNAB 4 parsing) correctly live in `api/src/lib` with tests. Orchestration of multi-row writes lives inside very large routers (`account.ts` 1007 lines, `scheduled-transaction.ts` 712), and the transfer pair write is duplicated there (detailed in chunk A). Move the write orchestration into `lib/*-write.ts` functions that take a `tx`. Routers stay thin, and the API harness can test those functions directly.
- Money math is split between the SQL in routers, pure lib, and the web (M1). Neither side owns it.
- On the web, page routes of 700 to 1000 lines mix data access, state and UI. That is the main reason there are no component tests. Extracting the register table and row and the budget table into `components/` would let test 15 and its siblings render them in isolation.
