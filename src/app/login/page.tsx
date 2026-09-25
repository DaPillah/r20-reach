"use client";

import { useState } from "react";
import { loginAction } from "@/app/auth-actions";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await loginAction(email, password);
    if (r.ok) {
      window.location.href = "/";
    } else {
      setError(r.error ?? "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl tracking-tight" style={{ color: "var(--accent)" }}>
            Oikos
          </h1>
          <p className="mt-1 text-xs italic" style={{ fontFamily: "var(--font-display)", color: "var(--gold)" }}>
            that no one be lost
          </p>
          <p className="mt-2 text-sm text-muted">Sign in to your follow-ups</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@r20.nyc"
            autoComplete="email"
            autoFocus
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-accent">{error}</p>}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="mt-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
