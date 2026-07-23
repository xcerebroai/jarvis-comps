import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasActiveEntitlement } from "@/lib/entitlements";
import SignOutButton from "@/components/SignOutButton";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between border-b border-navy-800 py-4">
        <Link href="/app">
          <Wordmark className="text-xl" />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/app" className="text-slate-400 transition hover:text-white">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="py-8 sm:py-12">
        <h1 className="text-2xl font-bold text-white">Account</h1>
        <div className="mt-6 max-w-md space-y-4 rounded-2xl border border-navy-700 bg-navy-850 p-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Email
            </div>
            <div className="mt-1 text-slate-200">{user.email}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Access
            </div>
            <div className="mt-1 text-slate-200">
              {hasActiveEntitlement(user) ? "Active" : "Inactive"}
              {user.isAdmin && " · Admin"}
            </div>
          </div>
          <div className="pt-2">
            <SignOutButton />
          </div>
        </div>
      </main>
    </div>
  );
}
