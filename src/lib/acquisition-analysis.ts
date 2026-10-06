/** Strict house-only acquisition value review. No provider I/O or offer execution. */
export class AcquisitionReviewRequired extends Error {
 readonly details?:Record<string,unknown>;
 constructor(message:string,details?:Record<string,unknown>){super(message);this.details=details;}
}
export type Source = { provider: string; reference: string; retrievedAt: string; synthetic: boolean };
export type AcquisitionComp = {
  id: string; salePrice: number; saleDate: string; saleType: string;
  sqft: number; distanceMiles: number; propertyType: string;
  saleVerified: boolean; renovatedComparable: boolean; source: Source;
};
export type AcquisitionPolicy = {
  approvalReference: string; maxAgeDays: number; maxSourceAgeHours: number;
  radiusMiles: number; sizeTolerance: number; minComps: number;
  verifiedSaleTypes: string[];
};
export type AcquisitionSubject = {
  id: string; asset: 'house' | 'land' | 'multifamily'; sqft: number;
  propertyType: string; identityVerified: boolean;
};
function finite(n: number, positive = false): boolean {
  return typeof n === 'number' && Number.isFinite(n) && (positive ? n > 0 : n >= 0);
}
function requireReview(ok: unknown, message: string): asserts ok {
  if (!ok) throw new AcquisitionReviewRequired(message);
}
function median(values: number[]): number {
  const ordered = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(ordered.length/2);
  return ordered.length%2 ? ordered[mid] : (ordered[mid-1]+ordered[mid])/2;
}
export function analyzeHouseValue(
  subject: AcquisitionSubject, records: AcquisitionComp[], policy: AcquisitionPolicy,
  now: Date, synthetic: boolean,
) {
  requireReview(typeof synthetic === 'boolean', 'Explicit synthetic state required');
  requireReview(subject.asset === 'house', 'Land and multifamily require separate reviewed methods');
  requireReview(subject.identityVerified && subject.id && subject.propertyType && finite(subject.sqft,true), 'Verified house identity, type and size required');
  requireReview(Number.isFinite(now.getTime()), 'Invalid analysis date');
  requireReview(policy.approvalReference && finite(policy.radiusMiles,true) && finite(policy.maxAgeDays,true) &&
    finite(policy.maxSourceAgeHours,true) && finite(policy.sizeTolerance) && policy.sizeTolerance<1 &&
    Number.isInteger(policy.minComps) && policy.minComps>=3 && policy.verifiedSaleTypes.length>0,
    'Explicit approved comp policy required');
  const seen = new Set<string>();
  const accepted: AcquisitionComp[] = [];
  const excluded: { id: string; reason: string }[] = [];
  for (const c of records) {
    let reason = '';
    const sale = Date.parse(c.saleDate);
    const retrieved = Date.parse(c.source?.retrievedAt);
    const ageDays = (now.getTime()-sale)/86400000;
    const sourceHours = (now.getTime()-retrieved)/3600000;
    if (!c.id || seen.has(c.id)) reason = 'Missing/duplicate source property ID';
    else if (!c.source?.reference || !c.source.retrievedAt || !/[zZ]|[+-]\d\d:\d\d$/.test(c.source.retrievedAt) ||
      !Number.isFinite(sourceHours) || sourceHours<0 || sourceHours>policy.maxSourceAgeHours ||
      c.source.synthetic!==synthetic || (!synthetic && c.source.provider!=='DealMachine')) reason='Invalid source provenance';
    else if (!c.saleVerified || !c.renovatedComparable || /estimated/i.test(c.saleType) || !policy.verifiedSaleTypes.includes(c.saleType)) reason='Unverified market sale or renovated comparability';
    else if (!finite(c.salePrice,true) || !finite(c.sqft,true) || !finite(c.distanceMiles) ||
      !Number.isFinite(ageDays) || ageDays<0 || ageDays>policy.maxAgeDays) reason='Invalid/stale/future sale facts';
    else if (c.propertyType!==subject.propertyType || c.distanceMiles>policy.radiusMiles ||
      Math.abs(c.sqft/subject.sqft-1)>policy.sizeTolerance) reason='Outside approved comp policy';
    seen.add(c.id);
    if (reason) excluded.push({id:c.id,reason}); else accepted.push(c);
  }
  requireReview(accepted.length>=policy.minComps, 'Insufficient verified primary comps');
  const perSqft = median(accepted.map(c=>c.salePrice/c.sqft));
  const cents = Math.round(perSqft*subject.sqft*100);
  requireReview(Number.isSafeInteger(cents) && cents>0, 'Value exceeds valid monetary precision');
  return {
    status:'INTERNAL_REVIEW' as const, method:'house_verified_renovated_sales',
    propertyId:subject.id, valueUsd:(cents/100).toFixed(2), synthetic,
    label:synthetic?'SYNTHETIC — TEST ONLY':'SOURCE-BACKED INTERNAL REVIEW',
    calculation:{formula:'median verified sale dollars/sqft × subject sqft',medianPerSqft:perSqft,subjectSqft:subject.sqft},
    policyReference:policy.approvalReference, usedCompIds:accepted.map(c=>c.id),
    sources:accepted.map(c=>c.source), excluded, outboundEnabled:false,
    offerApproved:false,
  };
}
