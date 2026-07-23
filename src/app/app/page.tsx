import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import CompsTool from "@/components/CompsTool";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between border-b border-navy-800 py-4">
        <Link href="/app">
          <Wordmark className="text-xl" />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/account"
            className="text-slate-400 transition hover:text-white"
          >
            Account
          </Link>
        </nav>
      </header>

      <main className="py-8 sm:py-12">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          Run comps on a property
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Paste a full address — street, city, state, ZIP. Jarvis pulls the
          subject and recent sold comps, then prices it by qualified $/sqft.
        </p>
        <div className="mt-8">
          <CompsTool />
        </div>
      </main>
    </div>
  );
}
