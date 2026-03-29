import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/src/routers/index";
import { useUserStore } from "./store/user";

export { type AppRouter };

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "http://localhost:3001/trpc",
        headers() {
          const slug = useUserStore.getState().userSlug;
          return slug ? { "x-user-slug": slug } : {};
        },
      }),
    ],
  });
}
