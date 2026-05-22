import { create } from "zustand";
import { persistAuth, clearAuth, readAuth, AuthUser } from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loaded: boolean;
  setSession(token: string, user: AuthUser, ttl?: number | null): void;
  clear(): void;
  hydrate(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loaded: false,

  hydrate() {
    const { token, user } = readAuth();
    set({ token: token ?? null, user: user ?? null, loaded: true });
  },

  setSession(token, user, ttl: number | null = 15) {
    persistAuth(token, user, ttl);
    set({ token, user });
  },

  clear() {
    clearAuth();
    set({ token: null, user: null });
  },
}));

export function hasRole(user: AuthUser | null, ...roles: string[]) {
  return user ? roles.includes(user.role ?? "") : false;
}
