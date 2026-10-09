import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render } from "@testing-library/react";
import { trpc, type AppRouter } from "@/trpc";

/**
 * What a procedure answers, by its dotted path (`account.list`). A function is
 * handed the input, so one fixture can answer several queries differently.
 * Queries with no fixture fail, so a test notices a request it did not expect;
 * mutations with no fixture succeed with null.
 */
export type Fixtures = Record<string, unknown>;

/** A request the component made, in the order it was made. */
export type Call = { path: string; type: "query" | "mutation" | "subscription"; input: unknown };

/**
 * A link that never leaves the process: it answers from `fixtures` and writes
 * every operation to `calls`, so a test can assert what a mutation was sent
 * without a server, a database or a network mock.
 */
export function fixtureLink(fixtures: Fixtures, calls: Call[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, type: op.type, input: op.input });
        const fixture = fixtures[op.path];
        if (fixture === undefined && op.type !== "mutation") {
          observer.error(TRPCClientError.from(new Error(`No fixture for ${op.path}`)));
          return;
        }
        Promise.resolve(typeof fixture === "function" ? fixture(op.input) : (fixture ?? null)).then(
          (data) => {
            observer.next({ result: { type: "data", data } });
            observer.complete();
          },
          (error: unknown) =>
            observer.error(
              TRPCClientError.from(error instanceof Error ? error : new Error(String(error)))
            )
        );
      });
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

/** The real tRPC provider over a fresh QueryClient and the fixture link. */
export function createTrpcWrapper(fixtures: Fixtures = {}) {
  const calls: Call[] = [];
  const queryClient = createTestQueryClient();
  const client = trpc.createClient({ links: [fixtureLink(fixtures, calls)] });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    );
  }

  /** The inputs every call to one procedure was sent, in order. */
  const inputsTo = (path: string) => calls.filter((c) => c.path === path).map((c) => c.input);

  return { Wrapper, calls, inputsTo, queryClient };
}

export function renderWithTrpc(ui: ReactElement, { fixtures }: { fixtures?: Fixtures } = {}) {
  const { Wrapper, ...rest } = createTrpcWrapper(fixtures);
  return { ...render(ui, { wrapper: Wrapper }), ...rest };
}
