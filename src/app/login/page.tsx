"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [isSetup, setIsSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "unauthorized" ? "You need to sign in to access Bonsai." : null
  );

  // Detect first-run: no humans exist yet
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 200) {
          window.location.replace("/");
        } else {
          // Check if setup is needed
          return fetch("/api/auth/needs-setup").then((r2) => r2.json());
        }
      })
      .then((data) => {
        if (data?.setup) setIsSetup(true);
        setCheckingSetup(false);
      })
      .catch(() => setCheckingSetup(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSetup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (isSetup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const body = isSetup
        ? { email, name, password, setup: true }
        : { email, password };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        window.location.replace("/");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign-in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSetup) return null;

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-8"
      style={{ minHeight: "100vh" }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <picture>
          <source srcSet="/bonsai-os-logo-l.png" media="(prefers-color-scheme: dark)" />
          <img src="/bonsai-os-logo-d.png" alt="Bonsai" className="w-14 h-14" />
        </picture>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Bonsai
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isSetup ? "Create your owner account to get started." : "AI-powered developer workspace"}
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 w-full max-w-xs"
      >
        {isSetup && (
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-4 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
        )}
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        />
        {isSetup && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="px-4 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
        )}

        {error && (
          <div
            className="px-4 py-3 rounded-lg text-sm text-center"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-indigo)" }}
        >
          {submitting
            ? isSetup ? "Creating account…" : "Signing in…"
            : isSetup ? "Create account" : "Sign in"}
        </button>
      </form>

      {isSetup && (
        <p className="text-xs text-center max-w-xs" style={{ color: "var(--text-muted)" }}>
          This creates the owner account. Additional users can be added in Settings → Humans.
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
