import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { trpc, createTRPCClient } from "./trpc";
import { useUserStore } from "./store/user";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30 } },
});

const trpcClient = createTRPCClient();

const router = createRouter({
  routeTree,
  context: { queryClient, userSlug: null },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const userSlug = useUserStore((s) => s.userSlug);
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient, userSlug }} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
