import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/src/routers/index";
import { useUserStore } from "./store/user";

export { type AppRouter };
export type { MonthSummary, CategoryMonth } from "../../api/src/routers/budget";
export type { HouseholdSplitOutputs } from "../../api/src/routers/household-split";

export const trpc = createTRPCReact<AppRouter>();

// Two servers in development and one in production, so the API is in two
// different places and the build is what knows which.
//
// A built app is served by the API itself, so the API is wherever the page came
// from and a relative path is both shorter and truer: it survives being served
// on another port, or behind something in front of it, without being told.
// The dev server is a second server on a second port, so there it has to be
// named, on whatever host served the page (localhost, znab, a .ts.net
// Tailscale address) rather than a hardcoded localhost that would only work
// from the machine itself.
const apiUrl = import.meta.env.PROD
  ? "/trpc"
  : `${window.location.protocol}//${window.location.hostname}:3001/trpc`;

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: apiUrl,
        headers() {
          const slug = useUserStore.getState().userSlug;
          return slug ? { "x-user-slug": slug } : {};
        },
      }),
    ],
  });
}
