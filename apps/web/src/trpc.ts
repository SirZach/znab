import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/src/routers/index";
import { useUserStore } from "./store/user";

export { type AppRouter };
export type { MonthSummary, CategoryMonth } from "../../api/src/routers/budget";

export const trpc = createTRPCReact<AppRouter>();

// Talk to the API on whatever host served this page (localhost, zachbox,
// a .ts.net Tailscale address, …) rather than hardcoding localhost, so the
// app works both locally and when accessed from another device.
const apiUrl = `${window.location.protocol}//${window.location.hostname}:3001/trpc`;

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
