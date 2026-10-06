"use client";

import { useState } from "react";
import type { QualifiedComp, ConfidenceLevel } from "@/lib/arv";
import type { CompsApiResponse } from "@/lib/types";
import {
  buildCompReportJson,
  buildCompReportMarkdown,
  fmtDate,
  subjectLine,
  usd,
} from "@/lib/report";

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
  medium: "bg-amber-500/15 text-amber-300 border-amber-400/40",
  low: "bg-rose-500/15 text-rose-300 border-rose-400/40",
};

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${CONFIDENCE_STYLES[level]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {level} confidence
    </span>
  );
}

function ReportActions({ data }: { data: CompsApiResponse }) {
  const [copied, setCopied] = useState<"summary" | "json" | null>(null);

  async function copyText(text: string, kind: "summary" | "json") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadMarkdown() {
    const blob = new Blob([buildCompReportMarkdown(data)], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `jarvis-comps-report-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const buttonClass =
    "rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => copyText(buildCompReportMarkdown(data), "summary")}
        className={buttonClass}
      >
        {copied === "summary" ? "Copied ✓" : "Copy summary"}
      </button>
      <button
        onClick={() => copyText(buildCompReportJson(data), "json")}
        className={buttonClass}
      >
        {copied === "json" ? "Copied ✓" : "Copy JSON"}
      </button>
      <button onClick={downloadMarkdown} className={buttonClass}>
        Download .md
      </button>
    </div>
  );
}

function CompTable({
  comps,
  excludedIds,
}: {
  comps: QualifiedComp[];
  excludedIds: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-700">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-navy-700 bg-navy-850 text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-3 font-medium">Address</th>
            <th className="px-4 py-3 font-medium">Sold price</th>
            <th className="px-4 py-3 font-medium">Sold date</th>
            <th className="px-4 py-3 font-medium">Sqft</th>
            <th className="px-4 py-3 font-medium">Bd/Ba</th>
            <th className="px-4 py-3 font-medium">Dist</th>
            <th className="px-4 py-3 font-medium">$/sqft</th>
          </tr>
        </thead>
        <tbody>
          {comps.map((c) => {
            const excluded = excludedIds.includes(c.id);
            return (
              <tr
                key={c.id}
                className={`border-b border-navy-800 last:border-0 ${excluded ? "opacity-40" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-200">{c.address}</div>
                  {excluded && (
                    <div className="text-xs text-slate-500">
                      excluded as $/sqft outlier
                    </div>
                  )}
                  {c.saleType?.toLowerCase().includes("estimated") && (
                    <div className="text-xs text-slate-500">
                      estimated sale price (non-disclosure state)
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-100">
                  {usd.format(c.salePrice)}
                </td>
                <td className="px-4 py-3 text-slate-300">{fmtDate(c.saleDate)}</td>
                <td className="px-4 py-3 text-slate-300">
                  {c.sqft.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {c.beds ?? "—"}/{c.baths ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {c.distanceMiles.toFixed(2)} mi
                </td>
                <td className="px-4 py-3 text-accent">
                  {usd.format(Math.round(c.pricePerSqft))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Results({ data }: { data: CompsApiResponse }) {
  const { subject, outcome, dmReferenceEstimate } = data;
  const subj: string[] = [];
  if (subject.beds != null) subj.push(`${subject.beds} bd`);
  if (subject.baths != null) subj.push(`${subject.baths} ba`);
  if (subject.sqft != null) subj.push(`${subject.sqft.toLocaleString()} sqft`);
  if (subject.yearBuilt != null) subj.push(`built ${subject.yearBuilt}`);
  if (subject.propertyType) subj.push(subject.propertyType);

  return (
    <div className="space-y-6">
      {/* Subject + ARV headline */}
      <div className="rounded-2xl border border-navy-700 bg-navy-850 p-5 sm:p-7">
        <div className="text-xs text-slate-500">
          Showing results for:{" "}
          <span className="text-slate-300">{data.matchedAddress}</span>
        </div>
        {data.addressWasNormalized && (
          <div className="mt-1 text-xs text-amber-300/80">
            We adjusted what you pasted to match this property — check it&rsquo;s
            the right one.
          </div>
        )}
        <div className="mt-2 text-sm text-slate-400">{subjectLine(subject)}</div>
        <div className="mt-1 text-xs text-slate-500">{subj.join(" · ")}</div>

        {outcome.ok ? (
          <>
            <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  ARV opinion
                </div>
                <div className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {usd.format(outcome.result.arv)}
                </div>
              </div>
              <div className="pb-1.5">
                <ConfidenceBadge level={outcome.result.confidence} />
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-400">
              {usd.format(outcome.result.arvPerSqft)}/sqft median · range{" "}
              {usd.format(outcome.result.rangeLow)} –{" "}
              {usd.format(outcome.result.rangeHigh)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Median $/sqft of {outcome.result.comps.length} sold comps within{" "}
              {outcome.result.tier.radiusMiles} mi over the last{" "}
              {outcome.result.tier.months} months, ±20% sqft, same property type.
              {dmReferenceEstimate != null && (
                <>
                  {" "}
                  Provider model estimate (reference only):{" "}
                  {usd.format(dmReferenceEstimate)}.
                </>
              )}
            </div>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                Why this confidence level?
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
                {outcome.result.confidenceFactors.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
            <div className="mt-5">
              <ReportActions data={data} />
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="font-semibold">ARV unavailable</div>
            <div className="mt-1">{outcome.reason}</div>
            {dmReferenceEstimate != null && (
              <div className="mt-2 text-amber-200/70">
                Provider model estimate (reference only):{" "}
                {usd.format(dmReferenceEstimate)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comp table */}
      {(outcome.ok ? outcome.result.comps : outcome.comps).length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Qualified sold comps
          </h3>
          <CompTable
            comps={outcome.ok ? outcome.result.comps : outcome.comps}
            excludedIds={outcome.ok ? outcome.result.excludedOutlierIds : []}
          />
        </div>
      )}
    </div>
  );
}

export default function CompsTool() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompsApiResponse | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim() || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
      } else {
        setData(body as CompsApiResponse);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={run} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Paste any address — e.g. 138 W Mariposa Dr, San Antonio, TX 78212"
          autoComplete="street-address"
          className="w-full flex-1 rounded-xl border border-navy-700 bg-navy-850 px-4 py-3.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-navy-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Running comps…" : "Get ARV"}
        </button>
      </form>

      <div className="mt-6">
        {loading && (
          <div className="rounded-2xl border border-navy-700 bg-navy-850 p-6 text-sm text-slate-400">
            <span className="animate-pulse">
              Pulling the subject property and nearby sold comps…
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}
        {data && <Results data={data} />}
      </div>
    </div>
  );
}
