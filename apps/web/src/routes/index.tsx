import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useUserStore } from "@/store/user";

export const Route = createFileRoute("/")({
  // A previously selected user is persisted to localStorage, so returning to the
  // root URL should go straight to their budgets instead of re-asking. Read the
  // store directly rather than from route context: "Switch user" clears the
  // store and navigates here in the same tick, before the context prop updates.
  beforeLoad: () => {
    const { userSlug } = useUserStore.getState();
    if (userSlug) {
      throw redirect({ to: "/budgets" });
    }
  },
  component: UserPickerPage,
});

const USERS = [
  {
    slug: "zach",
    displayName: "Zach",
    description: "Personal budget — Zach & Fiona",
    emoji: "👤",
  },
  {
    slug: "demo",
    displayName: "Demo",
    description: "Explore with sample data",
    emoji: "🎯",
  },
] as const;

function UserPickerPage() {
  const setUser = useUserStore((s) => s.setUser);
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();

  function handleSelect(slug: string) {
    queryClient.clear();
    setUser(slug);
    navigate({ to: "/budgets" });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">ZNAB</h1>
          <p className="text-muted-foreground">Select a user to continue</p>
        </div>

        <div className="grid gap-4">
          {USERS.map((user) => (
            <button
              key={user.slug}
              onClick={() => handleSelect(user.slug)}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-3xl">{user.emoji}</span>
              <div>
                <div className="font-semibold text-card-foreground group-hover:text-primary">
                  {user.displayName}
                </div>
                <div className="text-sm text-muted-foreground">{user.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
