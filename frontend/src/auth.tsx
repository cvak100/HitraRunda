import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api } from "./api";
import type { User } from "./types";

type AuthValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api<{ user: User | null }>("/api/auth/me/");
    setUser(data.user);
  }, []);

  useEffect(() => {
    api("/api/auth/csrf/")
      .then(() => refresh())
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout/", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider manjka.");
  return value;
}
