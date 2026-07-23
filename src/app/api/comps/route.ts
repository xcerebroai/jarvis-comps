// POST /api/comps — { address } in, subject + qualified comps + ARV +
// confidence out. Auth-gated; entitlement check is the Stripe seam.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasActiveEntitlement } from "@/lib/entitlements";
import {
  DealMachineError,
  resolveProperty,
  fetchComps,
  type DmComp,
} from "@/lib/dealmachine";
import { computeArv, type CompInput } from "@/lib/arv";

const schema = z.object({
  address: z
    .string()
    .trim()
    .min(5, "Enter a street address")
    .max(200, "That address is too long"),
});

function toCompInput(c: DmComp): CompInput {
  return {
    id: c.dm_property_id,
    address: c.display_line_1 ?? c.address,
    city: c.display_line_2 ?? null,
    salePrice: c.sale_price,
    saleDate: c.sale_date,
    saleType: c.sale_type,
    sqft: c.sqft,
    beds: c.bedrooms,
    baths: c.bathrooms,
    distanceMiles: c.distance,
    propertyType: c.property_type,
    yearBuilt: c.year_built,
  };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!hasActiveEntitlement(user)) {
    return NextResponse.json(
      { error: "Your subscription is not active. Contact support to restore access." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid address" },
      { status: 400 },
    );
  }

  try {
    const resolved = await resolveProperty(parsed.data.address);
    if ("error" in resolved) {
      const error =
        resolved.error === "unrecognized"
          ? "We couldn’t match that address. Check the spelling, or add the city and ZIP (e.g. “138 W Mariposa Dr, San Antonio, TX 78212”)."
          : "We found that address, but there’s no property record for it. Try the street address without a unit number.";
      return NextResponse.json({ error }, { status: 404 });
    }
    const { match, matchedAddress, normalized } = resolved;

    const compsResult = await fetchComps(match.dm_property_id!);
    if (!compsResult) {
      return NextResponse.json(
        { error: "Comp data is unavailable for that property." },
        { status: 502 },
      );
    }

    const subject = {
      address: compsResult.subject.display_line_1 ?? compsResult.subject.address,
      city: match.city ?? null,
      state: match.state ?? null,
      zip: match.zip ?? null,
      sqft: compsResult.subject.sqft ?? match.living_area_sqft ?? null,
      beds: compsResult.subject.bedrooms ?? match.num_bedrooms ?? null,
      baths: compsResult.subject.bathrooms ?? match.num_bathrooms ?? null,
      yearBuilt: compsResult.subject.year_built ?? match.year_built ?? null,
      propertyType: compsResult.subject.property_type,
      lotSizeAcres: compsResult.subject.lot_size ?? null,
    };

    const soldComps = compsResult.comps
      .filter((c) => c.type === "sale")
      .map(toCompInput);

    const outcome = computeArv(
      { sqft: subject.sqft, propertyType: subject.propertyType },
      soldComps,
    );

    // DealMachine's model estimate — displayed as a secondary reference only,
    // never used in the ARV math above.
    const dmReferenceEstimate =
      compsResult.value_estimation?.estimated_value ??
      compsResult.subject.estimated_value ??
      null;

    return NextResponse.json({
      subject,
      matchedAddress,
      addressWasNormalized: normalized,
      outcome,
      dmReferenceEstimate,
      totalSoldCompsFetched: soldComps.length,
    });
  } catch (err) {
    if (err instanceof DealMachineError) {
      const msg =
        err.status === 429
          ? "Rate limit reached — try again in a minute."
          : "Property data provider error. Try again shortly.";
      console.error("DealMachine error:", err.status, err.code, err.message);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error("comps route error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
