"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";

/**
 * LoginGuard — redirects unauthenticated users to /login.
 * Wraps the entire app layout so every page is protected.
 * The /login page itself is exempt.
 */
export function LoginGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // Pages that don't require auth
  const isPublicPage = pathname === "/login" || pathname.startsWith("/onboard");

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPage) {
      router.replace("/login");
    }
    // Redirect logged-in users away from the login page
    if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [loading, user, isPublicPage, pathname, router]);

  // On public pages, always render without waiting for auth
  // (but if already logged in and on /login, the effect will redirect)
  if (isPublicPage) return <>{children}</>;

  // While loading auth state, render nothing to avoid flash of unprotected content
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading...
        </span>
      </div>
    );
  }

  // Not logged in — redirecting via useEffect above
  if (!user) return null;

  return <>{children}</>;
}
