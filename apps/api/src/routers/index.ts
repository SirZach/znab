import { router } from "../trpc";
import { budgetRouter } from "./budget";
import { accountRouter } from "./account";
import { transactionRouter } from "./transaction";

export const appRouter = router({
  budget: budgetRouter,
  account: accountRouter,
  transaction: transactionRouter,
});

export type AppRouter = typeof appRouter;
