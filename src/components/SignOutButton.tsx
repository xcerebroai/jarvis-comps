"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/signout", { method: "POST" });
        router.push("/signin");
        router.refresh();
      }}
      className={
        className ||
        "rounded-lg border border-navy-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
      }
    >
      Sign out
    </button>
  );
}
