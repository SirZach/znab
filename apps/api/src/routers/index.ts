import { router } from "../trpc";
import { budgetRouter } from "./budget";
import { accountRouter } from "./account";
import { transactionRouter } from "./transaction";
import { payeeRouter } from "./payee";
import { reportRouter } from "./report";
import { categoryRouter } from "./category";

export const appRouter = router({
  budget: budgetRouter,
  account: accountRouter,
  transaction: transactionRouter,
  payee: payeeRouter,
  report: reportRouter,
  category: categoryRouter,
});

export type AppRouter = typeof appRouter;
