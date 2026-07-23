// Typed DealMachine API client. Server-side only — requires DEALMACHINE_API_KEY.
// Docs: https://api.docs.dealmachine.com
//
// Flow for an ARV run:
//   1. resolveProperty()            -> match a free-text address, get dm_property_id
//   2. POST /v1/comps               -> subject details + sold comps around it
//
// Response types below reflect the actual API payloads (verified live against
// San Antonio addresses), not just the OpenAPI spec — the spec leaves the
// comps `data` items untyped.

const BASE_URL = "https://api.v2.dealmachine.com/v1";

// DealMachine's edge occasionally rejects requests without a browser-like UA.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class DealMachineError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DealMachineError";
  }
}

async function dmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.DEALMACHINE_API_KEY;
  if (!apiKey) {
    throw new DealMachineError("DEALMACHINE_API_KEY is not configured", 500);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let code: string | undefined;
    let message = `DealMachine request failed (${res.status})`;
    try {
      const body = await res.json();
      code = body?.error?.code;
      message = body?.error?.message ?? message;
    } catch {
      // non-JSON error body; keep generic message
    }
    throw new DealMachineError(message, res.status, code);
  }
  return (await res.json()) as T;
}

// ---------- POST /v1/enrichment/address ----------

export interface AddressEnrichmentMatch {
  input: Record<string, string>;
  matched: boolean;
  match_failure?: { code: string; reason: string };
  dm_property_id?: string;
  full_address?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  estimated_value?: number | null;
  year_built?: number | null;
  living_area_sqft?: number | null;
  lot_size_sqft?: number | null;
  num_bedrooms?: number | null;
  num_bathrooms?: number | null;
  total_assessed_value?: number | null;
  owner_occupied?: boolean;
  apn?: string;
}

interface AddressEnrichmentResponse {
  data: AddressEnrichmentMatch[];
  totals: { submitted: number; matched: number; unmatched: number };
}

interface AddressParts {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Look up a property. `contact_audience: "none"` keeps the request to
 * property data only (no people credits).
 */
async function enrichAddress(
  input: { full_address: string } | AddressParts,
): Promise<AddressEnrichmentMatch | null> {
  const res = await dmFetch<AddressEnrichmentResponse>("/enrichment/address", {
    method: "POST",
    body: JSON.stringify({ data: [input], contact_audience: "none" }),
  });
  const match = res.data[0];
  return match?.matched ? match : null;
}

// ---------- GET /v1/addresses/autocomplete ----------

export interface AddressSuggestion {
  address: string;
  city: string;
  state: string;
  zip: string;
  full_address: string;
}

interface AutocompleteResponse {
  data: Array<{
    kind: string;
    label: string;
    address?: Partial<AddressSuggestion>;
  }>;
}

/** How many autocomplete suggestions to expand into enrichment candidates. */
export const MAX_SUGGESTIONS = 3;

/**
 * DealMachine's own address normalizer. Handles the messy input clients
 * actually paste — missing ZIP, unit numbers, stray commas, lowercase — and
 * returns canonical street/city/state/zip parts. Empty array when it can't
 * recognize the input as an address at all.
 *
 * Note its geocoder does NOT always agree with the property index; see
 * STREET_SUFFIXES below.
 */
export async function autocompleteAddresses(
  query: string,
  limit = MAX_SUGGESTIONS,
): Promise<AddressSuggestion[]> {
  const res = await dmFetch<AutocompleteResponse>(
    `/addresses/autocomplete?q=${encodeURIComponent(query)}`,
  );
  return (res.data ?? [])
    .filter((r) => r.kind === "address" && r.address?.zip && r.address?.address)
    .slice(0, limit)
    .map((hit) => ({
      address: hit.address!.address!,
      city: hit.address!.city ?? "",
      state: hit.address!.state ?? "",
      zip: hit.address!.zip!,
      full_address: hit.address!.full_address ?? hit.label,
    }));
}

/**
 * Trailing street-type tokens. DealMachine's property index and its
 * autocomplete geocoder disagree about these: autocomplete will happily
 * append a suffix that the property index doesn't carry.
 *
 * Real example — 7115 Glen Grove, San Antonio TX 78239 is stored as
 * "7115 GLEN GRV", where "Grove" IS the suffix. Autocomplete returns
 * "7115 Glen Grove Drive", inventing a "Drive" that makes enrichment miss.
 * So when the canonical street fails we retry with the trailing suffix
 * dropped.
 */
/*
 * Deliberately conservative. Only tokens a geocoder routinely *appends* are
 * listed. Words that just as often ARE the street name — Grove, Park, Trail,
 * Run, Bend, Cove, Ridge, Point, Meadow, Plaza — are excluded, because
 * stripping those is worse than useless: "7115 Glen Grove" would become
 * "7115 Glen" and could match a different parcel entirely.
 */
const STREET_SUFFIXES = new Set([
  "aly", "alley", "ave", "avenue", "blvd", "boulevard", "cir", "circle",
  "crossing", "ct", "court", "dr", "drive", "expy", "expressway", "highway",
  "hwy", "ln", "lane", "pkwy", "parkway", "pl", "place", "rd", "road", "st",
  "street", "ter", "terrace", "way", "xing",
]);

/** Drop one trailing street-type token, or null if there isn't one. */
export function stripTrailingSuffix(street: string): string | null {
  const parts = street.trim().split(/\s+/);
  if (parts.length < 3) return null; // keep at least "<number> <name>"
  const last = parts[parts.length - 1].toLowerCase().replace(/\.$/, "");
  if (!STREET_SUFFIXES.has(last)) return null;
  return parts.slice(0, -1).join(" ");
}

const ZIP_RE = /\b\d{5}\b/;

export type AddressCandidate =
  | { kind: "raw"; label: string; payload: { full_address: string } }
  | { kind: "structured"; label: string; payload: AddressParts };

/**
 * The raw pasted string as a candidate — only when it already carries a ZIP.
 * Enrichment hard-requires one, so trying it without is a guaranteed miss.
 */
export function buildRawCandidate(raw: string): AddressCandidate | null {
  const trimmed = raw.trim();
  if (!ZIP_RE.test(trimmed)) return null;
  return {
    kind: "raw",
    label: trimmed,
    payload: { full_address: trimmed },
  };
}

/**
 * Street variants for one autocomplete suggestion, in try-order:
 *   1. autocomplete's canonical street
 *   2. that street with a trailing street-type token removed
 */
export function buildSuggestionCandidates(
  suggestion: AddressSuggestion,
): AddressCandidate[] {
  const base = {
    city: suggestion.city,
    state: suggestion.state,
    zip: suggestion.zip,
  };
  const out: AddressCandidate[] = [];
  const seen = new Set<string>();
  for (const street of [
    suggestion.address,
    stripTrailingSuffix(suggestion.address),
  ]) {
    if (!street) continue;
    const key = street.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "structured",
      label: `${street}, ${base.city}, ${base.state} ${base.zip}`,
      payload: { street, ...base },
    });
  }
  return out;
}

/**
 * Full ordered candidate list for one pasted address. First match wins, so
 * the most faithful interpretation of what the client typed goes first.
 */
export function buildAddressCandidates(
  raw: string,
  suggestions: AddressSuggestion[],
): AddressCandidate[] {
  const rawCandidate = buildRawCandidate(raw);
  return [
    ...(rawCandidate ? [rawCandidate] : []),
    ...suggestions.flatMap(buildSuggestionCandidates),
  ];
}

export type ResolveFailure = "unrecognized" | "no_property_record";

export interface ResolvedProperty {
  match: AddressEnrichmentMatch;
  /** DealMachine's canonical address for what it matched. */
  matchedAddress: string;
  /** True when we had to normalize the input before it would match. */
  normalized: boolean;
}

/**
 * Resolve a single free-text address string a client pasted.
 *
 * Tries candidates in order and stops at the first match. The raw string
 * goes first when it carries a ZIP, since DealMachine's matcher is the
 * source of truth and that path costs one call. Otherwise we expand
 * autocomplete's suggestions into street variants — including a
 * suffix-stripped form, because autocomplete's geocoder and the property
 * index disagree about street suffixes (see STREET_SUFFIXES).
 *
 * Every attempt is logged so misses are diagnosable from Vercel logs
 * without needing to reproduce them.
 */
export async function resolveProperty(
  raw: string,
): Promise<ResolvedProperty | { error: ResolveFailure }> {
  const attempts: Array<{ candidate: string; outcome: string }> = [];

  // Fast path: raw string already carries a ZIP, so it's worth one direct
  // call before spending an autocomplete round-trip.
  const rawCandidate = buildRawCandidate(raw);
  if (rawCandidate) {
    const direct = await enrichAddress(rawCandidate.payload);
    if (direct?.dm_property_id) {
      attempts.push({ candidate: rawCandidate.label, outcome: "matched" });
      logResolution({
        input: raw,
        attempts,
        matched: direct.dm_property_id,
        matchedAddress: direct.full_address,
      });
      return {
        match: direct,
        matchedAddress: direct.full_address ?? raw,
        normalized: false,
      };
    }
    attempts.push({ candidate: rawCandidate.label, outcome: "no_match" });
  }

  const suggestions = await autocompleteAddresses(raw);
  if (!suggestions.length) {
    logResolution({ input: raw, attempts, matched: null, suggestions: [] });
    return { error: "unrecognized" };
  }

  for (const suggestion of suggestions) {
    for (const candidate of buildSuggestionCandidates(suggestion)) {
      const match = await enrichAddress(candidate.payload);
      if (match?.dm_property_id) {
        attempts.push({ candidate: candidate.label, outcome: "matched" });
        logResolution({
          input: raw,
          attempts,
          matched: match.dm_property_id,
          matchedAddress: match.full_address,
        });
        return {
          match,
          // DealMachine's property index is the source of truth for display,
          // not autocomplete's label.
          matchedAddress: match.full_address ?? suggestion.full_address,
          normalized: true,
        };
      }
      attempts.push({ candidate: candidate.label, outcome: "no_match" });
    }
  }

  logResolution({
    input: raw,
    attempts,
    matched: null,
    suggestions: suggestions.map((s) => s.full_address),
  });
  return { error: "no_property_record" };
}

function logResolution(entry: {
  input: string;
  attempts: Array<{ candidate: string; outcome: string }>;
  matched: string | null;
  matchedAddress?: string;
  suggestions?: string[];
}) {
  const payload = JSON.stringify({ event: "address_resolution", ...entry });
  if (entry.matched) console.info(payload);
  else console.warn(payload);
}

// ---------- POST /v1/comps ----------

export interface DmSubject {
  dm_property_id: string;
  address: string;
  display_line_1?: string;
  latitude: number;
  longitude: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  property_type: string | null;
  year_built: number | null;
  lot_size: number | null; // acres
  estimated_value: number | null;
  tax_assessed_value: number | null;
  property_taxes: number | null;
}

export interface DmComp {
  dm_property_id: string;
  type: string; // "sale" | "listing"
  address: string;
  display_line_1?: string;
  display_line_2?: string;
  latitude: number;
  longitude: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  property_type: string | null;
  year_built: number | null;
  lot_size: number | null;
  estimated_value: number | null;
  price_per_sqft: number | null;
  days_on_market: number | null;
  distance: number | null; // miles from subject
  sale_price: number | null;
  sale_date: string | null; // ISO date
  sale_type: string | null; // e.g. "Estimated Sales Price" in non-disclosure states
}

export interface DmCompsResult {
  dm_property_id: string;
  found: boolean;
  subject: DmSubject;
  comps: DmComp[];
  // DealMachine's own model output. Reference only — never our ARV.
  value_estimation: {
    estimated_value: number | null;
    confidence_interval: { low: number | null; high: number | null };
    methodology: string;
    based_on_comps: number;
  } | null;
  total_comps_found: number;
}

interface CompsResponse {
  data: DmCompsResult[];
}

/**
 * Fetch sold comps for a property. We deliberately fetch WIDE
 * (1 mile / 12 months / loose sqft + bed/bath tolerances) and run our own
 * deterministic qualification tiers in src/lib/arv.ts, so the tightening
 * rules live in our code, not in DealMachine's black box.
 */
export async function fetchComps(
  dmPropertyId: string,
): Promise<DmCompsResult | null> {
  const body = {
    property_ids: [dmPropertyId],
    location: { type: "radius", radius_miles: 1 },
    criteria: {
      timeframe: "12months",
      sqft_tolerance_percent: 30,
      bedroom_tolerance: 2,
      bathroom_tolerance: 2,
      match_property_type: true,
      include_active_listings: false,
      include_pending: false,
      include_foreclosures: false,
      sort_by: "distance",
      sort_direction: "asc",
      limit: 100,
    },
  };
  const res = await dmFetch<CompsResponse>("/comps", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const result = res.data[0];
  return result?.found ? result : null;
}
