"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface Human {
  id: number;
  name: string;
  email: string;
  isOwner: boolean;
  avatarData: string | null;
}

interface UserContextValue {
  user: Human | null;
  loading: boolean;
  setUser: (u: Human | null) => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Human | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 401) return null;
        return r.json();
      })
      .then((data) => {
        setUser(data ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
