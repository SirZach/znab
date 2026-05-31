import { router } from "../trpc";
import { budgetRouter } from "./budget";
import { accountRouter } from "./account";
import { transactionRouter } from "./transaction";
import { payeeRouter } from "./payee";
import { reportRouter } from "./report";

export const appRouter = router({
  budget: budgetRouter,
  account: accountRouter,
  transaction: transactionRouter,
  payee: payeeRouter,
  report: reportRouter,
});

export type AppRouter = typeof appRouter;
