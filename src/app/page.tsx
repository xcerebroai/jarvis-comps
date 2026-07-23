import Link from "next/link";
import Wordmark from "@/components/Wordmark";

const STEPS = [
  {
    n: "01",
    title: "Paste an address",
    body: "One input. Street, city, state, ZIP — that's all Jarvis needs.",
  },
  {
    n: "02",
    title: "Real sold comps pulled",
    body: "Recent nearby sales are qualified by distance, recency, size, and property type — automatically.",
  },
  {
    n: "03",
    title: "ARV opinion in seconds",
    body: "A deterministic $/sqft valuation with a confidence grade and every comp shown. No black box.",
  },
];

const SAMPLE_COMPS = [
  { addr: "331 Clarence St", price: "$256,357", date: "Apr 7", sqft: "1,678", dist: "0.31 mi", ppsf: "$153" },
  { addr: "313 W Wildwood", price: "$322,126", date: "Jan 30", sqft: "1,382", dist: "0.36 mi", ppsf: "$233" },
  { addr: "803 Fresno", price: "$246,933", date: "Jun 3", sqft: "1,610", dist: "0.44 mi", ppsf: "$153" },
  { addr: "415 La Manda Blvd", price: "$183,008", date: "Dec 18", sqft: "1,334", dist: "0.48 mi", ppsf: "$137" },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark className="text-xl" />
        <Link
          href="/signin"
          className="rounded-lg border border-navy-700 px-4 py-2 text-sm text-slate-300 transition hover:border-accent/50 hover:text-white"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-4 py-1.5 text-xs font-medium text-accent">
          <span className="size-1.5 rounded-full bg-accent" />
          ARV engine for real estate investors
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Instant ARV. Real comps.{" "}
          <span className="text-accent">No guesswork.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-slate-400 sm:text-lg">
          Paste any property address and get an after-repair value opinion
          backed by actual nearby sold comps — with the math shown, in seconds.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signin"
            className="w-full rounded-xl bg-accent px-8 py-3.5 font-semibold text-navy-950 transition hover:bg-cyan-300 sm:w-auto"
          >
            Sign in to run comps
          </Link>
          <span className="text-sm text-slate-500">
            Access included with your add-on purchase
          </span>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-navy-800 bg-navy-850/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
            How it works
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-navy-700 bg-navy-900 p-6"
              >
                <div className="text-sm font-bold text-accent">{s.n}</div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {s.title}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample report */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Every number is defensible
            </h2>
            <p className="mt-4 text-slate-400">
              Jarvis prices the subject off the median $/sqft of qualified sold
              comps — sold in the last 6 months, within half a mile, ±20%
              square footage, same property type. When data is thin, the search
              widens and the confidence grade tells you so.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                "ARV headline with value range and $/sqft basis",
                "Confidence grade from comp count, recency, and distance",
                "Full comp table — address, sold price, date, size, distance",
                "One-click copyable deal summary for your buyers",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="mt-1 text-accent">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* CSS-rendered sample report card */}
          <div className="rounded-2xl border border-navy-700 bg-navy-850 p-5 shadow-[0_0_60px_-20px_rgba(34,211,238,0.25)] sm:p-6">
            <div className="text-xs text-slate-500">SAMPLE REPORT</div>
            <div className="mt-2 text-sm text-slate-400">
              138 W Mariposa Dr, San Antonio, TX 78212
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
              <div className="text-4xl font-bold text-white">$227,000</div>
              <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                <span className="size-1 rounded-full bg-current" />
                Medium confidence
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              $167/sqft median · range $190,000 – $265,000 · 8 sold comps
            </div>
            <div className="mt-5 overflow-hidden rounded-lg border border-navy-700 text-xs">
              <div className="grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr] gap-2 border-b border-navy-700 bg-navy-800 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
                <div>Address</div>
                <div>Sold</div>
                <div>Sqft</div>
                <div>$/sqft</div>
              </div>
              {SAMPLE_COMPS.map((c) => (
                <div
                  key={c.addr}
                  className="grid grid-cols-[1.6fr_1fr_0.7fr_0.7fr] gap-2 border-b border-navy-800 px-3 py-2 last:border-0"
                >
                  <div className="truncate text-slate-300">{c.addr}</div>
                  <div className="text-slate-200">{c.price}</div>
                  <div className="text-slate-400">{c.sqft}</div>
                  <div className="text-accent">{c.ppsf}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-navy-800">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Stop guessing ARVs
          </h2>
          <p className="mx-auto mt-3 max-w-md text-slate-400">
            Comp-backed valuations your buyers can trust, in the time it takes
            to paste an address.
          </p>
          <Link
            href="/signin"
            className="mt-8 inline-block rounded-xl bg-accent px-8 py-3.5 font-semibold text-navy-950 transition hover:bg-cyan-300"
          >
            Get access
          </Link>
        </div>
      </section>

      <footer className="border-t border-navy-800 py-8 text-center text-xs text-slate-600">
        <Wordmark className="text-sm" />
        <div className="mt-2">
          ARV opinions are estimates for research purposes, not appraisals.
        </div>
      </footer>
    </div>
  );
}
