"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { MIN_PASSWORD_LENGTH, validateSignupInput } from "@/lib/invites";

const FIELD_CLASS =
  "w-full rounded-xl border border-navy-700 bg-navy-850 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

export default function SignUpPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const input = { code, email, password, confirmPassword };
    const clientErrors = validateSignupInput(input);
    if (clientErrors.length) {
      setError(clientErrors[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        router.push("/app");
        router.refresh();
      } else {
        const body = await res.json();
        setError(body.error ?? "Sign-up failed. Try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/">
            <Wordmark className="text-2xl" />
          </Link>
          <p className="mt-2 text-sm text-slate-400">
            Create your account with the invite code from your add-on purchase.
          </p>
        </div>

        <div className="rounded-2xl border border-navy-700 bg-navy-850 p-6 sm:p-8">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Invite code
              </label>
              <input
                id="code"
                type="text"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH-JK"
                className={`${FIELD_CLASS} font-mono tracking-widest`}
              />
            </div>

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
                className={FIELD_CLASS}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD_CLASS}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={FIELD_CLASS}
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
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/signin" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
