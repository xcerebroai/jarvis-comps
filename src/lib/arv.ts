// ARV engine — pure functions, no I/O. Unit tests in arv.test.ts.
//
// Qualification tiers (widened only when the previous tier is thin):
//   Tier 1: sold within 6 months, within 0.5 mi
//   Tier 2: sold within 12 months, within 0.5 mi
//   Tier 3: sold within 12 months, within 1.0 mi
// Always required: ±20% of subject sqft, same property type, a real sale
// price/date/sqft.
//
// ARV = median $/sqft of qualified comps (outlier-trimmed when there are
// enough comps) × subject sqft. Deterministic — DealMachine's
// value_estimation is never used here.

export interface SubjectInput {
  sqft: number | null;
  propertyType: string | null;
}

export interface CompInput {
  id: string;
  address: string;
  city?: string | null;
  salePrice: number | null;
  saleDate: string | null; // ISO date
  saleType?: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  distanceMiles: number | null;
  propertyType: string | null;
  yearBuilt?: number | null;
}

export interface QualifiedComp extends CompInput {
  salePrice: number;
  saleDate: string;
  sqft: number;
  distanceMiles: number;
  pricePerSqft: number;
  monthsAgo: number;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Tier {
  months: number;
  radiusMiles: number;
}

export const TIERS: Tier[] = [
  { months: 6, radiusMiles: 0.5 },
  { months: 12, radiusMiles: 0.5 },
  { months: 12, radiusMiles: 1.0 },
];

/** Minimum qualified comps for a tier to be considered sufficient. */
export const MIN_COMPS = 3;
/** Minimum qualified comps to produce an ARV at all. */
export const MIN_COMPS_FOR_ARV = 2;
export const SQFT_TOLERANCE = 0.2;

export interface ArvResult {
  arv: number;
  arvPerSqft: number;
  /** p25/p75 of comp $/sqft applied to subject sqft. */
  rangeLow: number;
  rangeHigh: number;
  confidence: ConfidenceLevel;
  confidenceFactors: string[];
  tier: Tier;
  comps: QualifiedComp[];
  /** Comps used in the $/sqft stat after outlier trimming. */
  usedCompIds: string[];
  excludedOutlierIds: string[];
}

export type ArvOutcome =
  | { ok: true; result: ArvResult }
  | { ok: false; reason: string; comps: QualifiedComp[] };

// ---------- small stats helpers ----------

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Linear-interpolated percentile, p in [0, 1]. */
export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.44);
}

function normalizeType(t: string | null): string {
  return (t ?? "").trim().toLowerCase();
}

// ---------- qualification ----------

/**
 * Filter raw comps to those valid for a given tier. Sqft/type rules always
 * apply; recency and radius come from the tier.
 */
export function qualifyComps(
  subject: SubjectInput,
  comps: CompInput[],
  tier: Tier,
  now: Date,
): QualifiedComp[] {
  const subjectSqft = subject.sqft ?? 0;
  const subjectType = normalizeType(subject.propertyType);
  const out: QualifiedComp[] = [];
  for (const c of comps) {
    if (!c.salePrice || c.salePrice <= 0) continue;
    if (!c.sqft || c.sqft <= 0) continue;
    if (!c.saleDate) continue;
    if (c.distanceMiles == null || c.distanceMiles > tier.radiusMiles) continue;

    const saleDate = new Date(c.saleDate);
    if (Number.isNaN(saleDate.getTime())) continue;
    const monthsAgo = monthsBetween(saleDate, now);
    if (monthsAgo < 0 || monthsAgo > tier.months) continue;

    if (subjectSqft > 0) {
      const ratio = c.sqft / subjectSqft;
      if (ratio < 1 - SQFT_TOLERANCE || ratio > 1 + SQFT_TOLERANCE) continue;
    }
    if (subjectType && normalizeType(c.propertyType) !== subjectType) continue;

    out.push({
      ...c,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      sqft: c.sqft,
      distanceMiles: c.distanceMiles,
      pricePerSqft: c.salePrice / c.sqft,
      monthsAgo,
    });
  }
  return out.sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/**
 * IQR outlier trim on $/sqft. Only applied with 5+ comps so small sets
 * aren't gutted; always keeps at least MIN_COMPS_FOR_ARV comps.
 */
export function trimOutliers(comps: QualifiedComp[]): {
  kept: QualifiedComp[];
  excluded: QualifiedComp[];
} {
  if (comps.length < 5) return { kept: comps, excluded: [] };
  const ppsf = comps.map((c) => c.pricePerSqft);
  const q1 = percentile(ppsf, 0.25);
  const q3 = percentile(ppsf, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const kept = comps.filter((c) => c.pricePerSqft >= lo && c.pricePerSqft <= hi);
  if (kept.length < MIN_COMPS_FOR_ARV) return { kept: comps, excluded: [] };
  return {
    kept,
    excluded: comps.filter((c) => !kept.includes(c)),
  };
}

// ---------- confidence ----------

export function scoreConfidence(
  comps: QualifiedComp[],
  tier: Tier,
): { level: ConfidenceLevel; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  if (comps.length >= 8) {
    score += 3;
    factors.push(`${comps.length} qualified comps (strong sample)`);
  } else if (comps.length >= 5) {
    score += 2;
    factors.push(`${comps.length} qualified comps (solid sample)`);
  } else if (comps.length >= 3) {
    score += 1;
    factors.push(`${comps.length} qualified comps (thin sample)`);
  } else {
    factors.push(`only ${comps.length} qualified comps (very thin sample)`);
  }

  if (tier.months <= 6 && tier.radiusMiles <= 0.5) {
    score += 2;
    factors.push("all comps sold within 6 months and 0.5 mi");
  } else if (tier.radiusMiles <= 0.5) {
    score += 1;
    factors.push("comps within 0.5 mi, but recency widened to 12 months");
  } else {
    factors.push(
      `search widened to ${tier.radiusMiles} mi / ${tier.months} months`,
    );
  }

  const avgDistance =
    comps.reduce((s, c) => s + c.distanceMiles, 0) / Math.max(comps.length, 1);
  if (avgDistance <= 0.35) {
    score += 1;
    factors.push(`avg comp distance ${avgDistance.toFixed(2)} mi (tight)`);
  } else {
    factors.push(`avg comp distance ${avgDistance.toFixed(2)} mi`);
  }

  if (comps.length >= 2) {
    const ppsf = comps.map((c) => c.pricePerSqft);
    const spread =
      (percentile(ppsf, 0.75) - percentile(ppsf, 0.25)) / median(ppsf);
    if (spread <= 0.15) {
      score += 2;
      factors.push(`$/sqft spread ${(spread * 100).toFixed(0)}% (very consistent)`);
    } else if (spread <= 0.3) {
      score += 1;
      factors.push(`$/sqft spread ${(spread * 100).toFixed(0)}% (moderate)`);
    } else {
      factors.push(`$/sqft spread ${(spread * 100).toFixed(0)}% (wide)`);
    }
  }

  const level: ConfidenceLevel = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  return { level, factors };
}

// ---------- main entry ----------

export function computeArv(
  subject: SubjectInput,
  rawComps: CompInput[],
  now: Date = new Date(),
): ArvOutcome {
  if (!subject.sqft || subject.sqft <= 0) {
    return {
      ok: false,
      reason:
        "Subject property has no recorded living area (sqft), so a $/sqft ARV can't be computed.",
      comps: [],
    };
  }

  let tierUsed: Tier = TIERS[TIERS.length - 1];
  let qualified: QualifiedComp[] = [];
  for (const tier of TIERS) {
    qualified = qualifyComps(subject, rawComps, tier, now);
    tierUsed = tier;
    if (qualified.length >= MIN_COMPS) break;
  }

  if (qualified.length < MIN_COMPS_FOR_ARV) {
    return {
      ok: false,
      reason:
        "Not enough qualified sold comps nearby (need at least 2 within 1 mile sold in the last 12 months, ±20% sqft, same property type).",
      comps: qualified,
    };
  }

  const { kept, excluded } = trimOutliers(qualified);
  const ppsf = kept.map((c) => c.pricePerSqft);
  const medianPpsf = median(ppsf);
  const arv = Math.round((medianPpsf * subject.sqft) / 1000) * 1000;
  const rangeLow =
    Math.round((percentile(ppsf, 0.25) * subject.sqft) / 1000) * 1000;
  const rangeHigh =
    Math.round((percentile(ppsf, 0.75) * subject.sqft) / 1000) * 1000;

  const { level, factors } = scoreConfidence(qualified, tierUsed);

  return {
    ok: true,
    result: {
      arv,
      arvPerSqft: Math.round(medianPpsf),
      rangeLow,
      rangeHigh,
      confidence: level,
      confidenceFactors: factors,
      tier: tierUsed,
      comps: qualified,
      usedCompIds: kept.map((c) => c.id),
      excludedOutlierIds: excluded.map((c) => c.id),
    },
  };
}
