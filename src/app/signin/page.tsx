"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dest = searchParams.get("embed") === "1" ? "/embed" : "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(dest);
        router.refresh();
      } else {
        const body = await res.json();
        setError(body.error ?? "Sign-in failed");
        setLoading(false);
      }
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-slate-300"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-navy-700 bg-navy-850 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-slate-300"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-navy-700 bg-navy-850 px-4 py-3 text-slate-100 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>
      {error && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-accent px-6 py-3 font-semibold text-navy-950 transition hover:bg-cyan-300 disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/">
            <Wordmark className="text-2xl" />
          </Link>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to run comps. Access is provisioned with your add-on
            purchase.
          </p>
        </div>
        <div className="rounded-2xl border border-navy-700 bg-navy-850 p-6 sm:p-8">
          <Suspense>
            <SignInForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          Have an invite code?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create your account
          </Link>
        </p>
      </div>
    </div>
  );
}
