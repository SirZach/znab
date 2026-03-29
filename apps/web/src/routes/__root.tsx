import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
  userSlug: string | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
