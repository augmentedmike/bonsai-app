"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

interface User {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface UserContextValue {
  user: User | null;
  setAvatarUrl: (url: string) => void;
}

const UserContext = createContext<UserContextValue>({ user: null, setAvatarUrl: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/onboard/user")
      .then((r) => r.json())
      .then((data) => { if (data.user) setUser(data.user); })
      .catch(() => {});
  }, []);

  const setAvatarUrl = useCallback((url: string) => {
    setUser((u) => u ? { ...u, avatarUrl: url } : u);
  }, []);

  return (
    <UserContext.Provider value={{ user, setAvatarUrl }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
