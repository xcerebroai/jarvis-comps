// Chrome-stripped variant of the dashboard for iframe embeds (GHL).
// Same auth gate — the session cookie is SameSite=None in production so it
// works inside a cross-origin iframe. See README "GHL embed".

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import CompsTool from "@/components/CompsTool";
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export default async function EmbedPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?embed=1");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <Wordmark className="text-base" />
      </div>
      <CompsTool />
    </div>
  );
}
