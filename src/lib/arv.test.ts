import { describe, expect, it } from "vitest";
import {
  computeArv,
  median,
  percentile,
  qualifyComps,
  scoreConfidence,
  trimOutliers,
  type CompInput,
  type QualifiedComp,
} from "./arv";

const NOW = new Date("2026-07-22T00:00:00Z");

function comp(overrides: Partial<CompInput> & { id: string }): CompInput {
  return {
    address: `${overrides.id} Test St`,
    salePrice: 250000,
    saleDate: "2026-05-01",
    sqft: 1400,
    beds: 3,
    baths: 2,
    distanceMiles: 0.3,
    propertyType: "Single Family",
    ...overrides,
  };
}

const SUBJECT = { sqft: 1400, propertyType: "Single Family" };
const TIER1 = { months: 6, radiusMiles: 0.5 };

describe("median / percentile", () => {
  it("computes odd and even medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("interpolates percentiles", () => {
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentile([10], 0.5)).toBe(10);
  });
});

describe("qualifyComps", () => {
  it("keeps a clean in-tier comp", () => {
    const q = qualifyComps(SUBJECT, [comp({ id: "a" })], TIER1, NOW);
    expect(q).toHaveLength(1);
    expect(q[0].pricePerSqft).toBeCloseTo(250000 / 1400);
  });

  it("rejects sales older than the tier window", () => {
    const q = qualifyComps(
      SUBJECT,
      [comp({ id: "a", saleDate: "2025-12-01" })],
      TIER1,
      NOW,
    );
    expect(q).toHaveLength(0);
  });

  it("rejects comps beyond the tier radius", () => {
    const q = qualifyComps(
      SUBJECT,
      [comp({ id: "a", distanceMiles: 0.8 })],
      TIER1,
      NOW,
    );
    expect(q).toHaveLength(0);
  });

  it("enforces ±20% sqft", () => {
    const q = qualifyComps(
      SUBJECT,
      [
        comp({ id: "small", sqft: 1100 }), // -21.4%
        comp({ id: "edge", sqft: 1120 }), // -20% exactly, allowed
        comp({ id: "big", sqft: 1700 }), // +21.4%
      ],
      TIER1,
      NOW,
    );
    expect(q.map((c) => c.id)).toEqual(["edge"]);
  });

  it("requires same property type (case-insensitive)", () => {
    const q = qualifyComps(
      SUBJECT,
      [
        comp({ id: "condo", propertyType: "Condo" }),
        comp({ id: "sf", propertyType: "single family" }),
      ],
      TIER1,
      NOW,
    );
    expect(q.map((c) => c.id)).toEqual(["sf"]);
  });

  it("drops comps missing price, sqft, date, distance, or future-dated", () => {
    const q = qualifyComps(
      SUBJECT,
      [
        comp({ id: "noprice", salePrice: null }),
        comp({ id: "nosqft", sqft: null }),
        comp({ id: "nodate", saleDate: null }),
        comp({ id: "nodist", distanceMiles: null }),
        comp({ id: "future", saleDate: "2026-09-01" }),
      ],
      TIER1,
      NOW,
    );
    expect(q).toHaveLength(0);
  });
});

describe("trimOutliers", () => {
  it("does not trim small sets", () => {
    const comps = [100, 200, 900].map(
      (p, i) =>
        qualifyComps(SUBJECT, [comp({ id: `c${i}`, salePrice: p * 1400 })], TIER1, NOW)[0],
    );
    expect(trimOutliers(comps).excluded).toHaveLength(0);
  });

  it("trims extreme $/sqft outliers from larger sets", () => {
    const ppsfs = [150, 152, 155, 158, 160, 400];
    const comps: QualifiedComp[] = ppsfs.map(
      (p, i) =>
        qualifyComps(SUBJECT, [comp({ id: `c${i}`, salePrice: p * 1400 })], TIER1, NOW)[0],
    );
    const { kept, excluded } = trimOutliers(comps);
    expect(excluded.map((c) => c.id)).toEqual(["c5"]);
    expect(kept).toHaveLength(5);
  });
});

describe("computeArv", () => {
  it("computes median $/sqft ARV from tier-1 comps", () => {
    const comps = [
      comp({ id: "a", salePrice: 210000, sqft: 1400 }), // $150/sqft
      comp({ id: "b", salePrice: 224000, sqft: 1400 }), // $160/sqft
      comp({ id: "c", salePrice: 238000, sqft: 1400 }), // $170/sqft
    ];
    const out = computeArv(SUBJECT, comps, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.arvPerSqft).toBe(160);
    expect(out.result.arv).toBe(224000); // 160 * 1400
    expect(out.result.tier).toEqual(TIER1);
    expect(out.result.rangeLow).toBeLessThanOrEqual(out.result.arv);
    expect(out.result.rangeHigh).toBeGreaterThanOrEqual(out.result.arv);
  });

  it("falls back to 12 months when 6-month comps are thin", () => {
    const comps = [
      comp({ id: "recent", saleDate: "2026-06-01" }),
      comp({ id: "old1", saleDate: "2025-10-01" }),
      comp({ id: "old2", saleDate: "2025-09-01" }),
    ];
    const out = computeArv(SUBJECT, comps, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.tier).toEqual({ months: 12, radiusMiles: 0.5 });
    expect(out.result.comps).toHaveLength(3);
  });

  it("expands to 1 mile when 0.5 mile is thin", () => {
    const comps = [
      comp({ id: "near" }),
      comp({ id: "far1", distanceMiles: 0.7 }),
      comp({ id: "far2", distanceMiles: 0.9 }),
    ];
    const out = computeArv(SUBJECT, comps, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.tier).toEqual({ months: 12, radiusMiles: 1.0 });
  });

  it("fails cleanly with fewer than 2 qualified comps", () => {
    const out = computeArv(SUBJECT, [comp({ id: "only" })], NOW);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.comps).toHaveLength(1);
  });

  it("fails cleanly when subject has no sqft", () => {
    const out = computeArv({ sqft: null, propertyType: "Single Family" }, [], NOW);
    expect(out.ok).toBe(false);
  });

  it("is deterministic for identical input", () => {
    const comps = [
      comp({ id: "a", salePrice: 200000 }),
      comp({ id: "b", salePrice: 220000 }),
      comp({ id: "c", salePrice: 240000 }),
    ];
    const a = computeArv(SUBJECT, comps, NOW);
    const b = computeArv(SUBJECT, comps, NOW);
    expect(a).toEqual(b);
  });
});

describe("scoreConfidence", () => {
  function qcomps(n: number, ppsf = 160, distance = 0.3): QualifiedComp[] {
    return Array.from({ length: n }, (_, i) =>
      qualifyComps(
        SUBJECT,
        [comp({ id: `c${i}`, salePrice: ppsf * 1400, distanceMiles: distance })],
        TIER1,
        NOW,
      )[0],
    );
  }

  it("rates many tight tier-1 comps high", () => {
    const { level } = scoreConfidence(qcomps(8), TIER1);
    expect(level).toBe("high");
  });

  it("rates a thin widened sample low", () => {
    const { level } = scoreConfidence(
      qcomps(2, 160, 0.9).map((c, i) => ({
        ...c,
        pricePerSqft: i === 0 ? 100 : 200, // wide spread
      })),
      { months: 12, radiusMiles: 1.0 },
    );
    expect(level).toBe("low");
  });
});
