import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { act, render, type RenderResult } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";
import { useUserStore } from "@/store/user";
import { createTrpcWrapper, type Fixtures } from "./trpc";

/**
 * The app's real route tree at `url`, in memory, over the fixture link. For a
 * page whose logic lives in its route file and reads `Route.useSearch` and
 * friends, which only resolve inside the router that owns them. The budget
 * layout sends anyone without a user back to the start, so one is signed in.
 */
export async function renderRoute(url: string, { fixtures }: { fixtures?: Fixtures } = {}) {
  useUserStore.setState({ userSlug: "test" });
  const { Wrapper, ...rest } = createTrpcWrapper(fixtures);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient: rest.queryClient, userSlug: "test" },
  });
  await router.load();
  // The router settles its matches a tick after mounting, so the first render
  // is awaited inside act rather than left to warn about updates outside it.
  let rendered!: RenderResult;
  await act(async () => {
    rendered = render(<RouterProvider router={router} />, { wrapper: Wrapper });
  });
  return { ...rendered, ...rest, router };
}
