import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/src/routers/index";
import { useUserStore } from "./store/user";

export type { AppRouter };
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
// from the machine itself. Its port is 3002, so dev runs beside prod on 3001;
// VITE_API_PORT moves it, and scripts/dev-env.sh moves the dev API with it.
export const apiOrigin = import.meta.env.PROD
  ? ""
  : `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_API_PORT || "3002"}`;

/** Who the API is asked as: the header every request to it carries. */
export function authHeaders(): Record<string, string> {
  const slug = useUserStore.getState().userSlug;
  return slug ? { "x-user-slug": slug } : {};
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [httpBatchLink({ url: `${apiOrigin}/trpc`, headers: authHeaders })],
  });
}
