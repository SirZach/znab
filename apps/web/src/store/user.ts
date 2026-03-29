import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  userSlug: string | null;
  setUser: (slug: string) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userSlug: null,
      setUser: (slug) => set({ userSlug: slug }),
      clearUser: () => set({ userSlug: null }),
    }),
    { name: "znab-user" }
  )
);
