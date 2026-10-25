import { router } from "../trpc";
import { budgetRouter } from "./budget";
import { accountRouter } from "./account";
import { transactionRouter } from "./transaction";
import { payeeRouter } from "./payee";
import { reportRouter } from "./report";
import { categoryRouter } from "./category";
import { scheduledTransactionRouter } from "./scheduled-transaction";
import { householdSplitRouter } from "./household-split";
import { auditRouter } from "./audit";

export const appRouter = router({
  budget: budgetRouter,
  account: accountRouter,
  transaction: transactionRouter,
  payee: payeeRouter,
  report: reportRouter,
  category: categoryRouter,
  scheduledTransaction: scheduledTransactionRouter,
  householdSplit: householdSplitRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
