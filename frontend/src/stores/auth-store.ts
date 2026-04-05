import { create } from "zustand";
import { apiFetch } from "@/lib/api";

interface User {
  id: number;
  username: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  login: async (username: string, password: string) => {
    const res = await apiFetch<{ token: string; role: string; expires_at: string }>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
    );

    const user: User = { id: 0, username, role: res.role };
    localStorage.setItem("token", res.token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token: res.token, user, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null, isLoading: false });
  },

  loadFromStorage: () => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        set({ token, user, isLoading: false });
      } catch {
        set({ token: null, user: null, isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },
}));
