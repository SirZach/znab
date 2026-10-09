import { redirect } from "@tanstack/react-router";
import { useUserStore } from "@/store/user";

/**
 * A route's `beforeLoad` guard: no user chosen, back to the picker. It reads the
 * store rather than route context, since "Switch user" clears the store and
 * navigates in the same tick, before the context prop catches up, and a stale
 * context would bounce two guards off each other.
 */
export function requireUser() {
  if (!useUserStore.getState().userSlug) {
    throw redirect({ to: "/" });
  }
}
