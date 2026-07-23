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

/**
 * DealMachine's own address normalizer. Handles the messy input clients
 * actually paste — missing ZIP, unit numbers, stray commas, lowercase — and
 * returns a canonical street/city/state/zip. Returns null for input it can't
 * recognize as an address at all.
 */
export async function autocompleteAddress(
  query: string,
): Promise<AddressSuggestion | null> {
  const res = await dmFetch<AutocompleteResponse>(
    `/addresses/autocomplete?q=${encodeURIComponent(query)}`,
  );
  const hit = res.data?.find(
    (r) => r.kind === "address" && r.address?.zip && r.address?.address,
  );
  if (!hit?.address) return null;
  const a = hit.address;
  return {
    address: a.address!,
    city: a.city ?? "",
    state: a.state ?? "",
    zip: a.zip!,
    full_address: a.full_address ?? hit.label,
  };
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
 * Fast path: hand the raw string straight to DealMachine — their matcher is
 * the source of truth. Their matcher hard-requires a ZIP though, and real
 * pasted input often lacks one (or carries a unit number, or stray commas),
 * so on a miss we normalize through their autocomplete endpoint and retry
 * with structured fields.
 */
export async function resolveProperty(
  raw: string,
): Promise<ResolvedProperty | { error: ResolveFailure }> {
  const direct = await enrichAddress({ full_address: raw });
  if (direct?.dm_property_id) {
    return {
      match: direct,
      matchedAddress: direct.full_address ?? raw,
      normalized: false,
    };
  }

  const suggestion = await autocompleteAddress(raw);
  if (!suggestion) return { error: "unrecognized" };

  const retry = await enrichAddress({
    street: suggestion.address,
    city: suggestion.city,
    state: suggestion.state,
    zip: suggestion.zip,
  });
  if (!retry?.dm_property_id) return { error: "no_property_record" };

  return {
    match: retry,
    matchedAddress: retry.full_address ?? suggestion.full_address,
    normalized: true,
  };
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
