/** Existing-host composition. Disabled by default; no credentials are generated. */
import {AcquisitionRepository} from './acquisition-repository';
import type {BoundSql} from './acquisition-repository';
import {scopedBearerAuth} from './acquisition-auth';
import {AcquisitionReviewRequired} from './acquisition-analysis';
import type {AcquisitionPolicy} from './acquisition-analysis';
import type {AcquisitionRuntime,AcquisitionContext} from './acquisition-handler';
import type {AcquisitionBundle} from './acquisition-bundle';
import type {ResolvedProperty,ResolveFailure,DmCompsResult} from './dealmachine';
export type AcquisitionProvider={resolveProperty(address:string):Promise<ResolvedProperty|{error:ResolveFailure}>;fetchComps(id:string):Promise<DmCompsResult|null>};
export function composeAcquisitionRuntime(sql:BoundSql,provider:AcquisitionProvider):AcquisitionRuntime {
 const repo=new AcquisitionRepository(sql);
 return {
  lookup:(c,id)=>repo.loadRequest(c,id),
  authenticate:scopedBearerAuth(repo),
  settings:async c=>{const settings=await repo.settings(c);if(!settings?.selected)return null;return {selected:true,policy:settings.policy&&typeof settings.policy==='object'?settings.policy as AcquisitionPolicy:null};},
  persist:(c,id,digest,result)=>repo.persist(c,id,digest,result),
  comps:async(c:AcquisitionContext,address:string)=>{
   // Evidence is entered by an authenticated reviewer, never the agent body.
   const rows=await sql.query<{bundle:AcquisitionBundle;reviewReference:string;reviewedAt:string;expiresAt:string}>(`SELECT e.bundle,e."reviewReference",e."reviewedAt",e."expiresAt" FROM "AcquisitionEvidence" e JOIN "AcquisitionMembership" m ON m.agency=e.agency AND m.location=e.location AND m.actor=e."reviewedBy" WHERE e.agency=$1 AND e.location=$2 AND e."normalizedAddress"=$3 AND e.revoked=FALSE AND e."expiresAt">CURRENT_TIMESTAMP AND e."reviewedAt"<=CURRENT_TIMESTAMP AND e."reviewReference"<>'' AND m.enabled=TRUE AND m.role='human_reviewer'`,[c.agency,c.location,address.trim().toLowerCase()]);
   const bundle=rows[0]?.bundle;
   if(!bundle){
    const resolved=await provider.resolveProperty(address);if('error' in resolved||!resolved.match.dm_property_id)throw new AcquisitionReviewRequired('Property identity unresolved; confirm exact address/parcel');
    const raw=await provider.fetchComps(resolved.match.dm_property_id);if(!raw)throw new AcquisitionReviewRequired('Candidate property research unavailable');
    throw new AcquisitionReviewRequired('Candidate research requires asset, market-sale and condition review before valuation',{
     propertyId:raw.subject.dm_property_id,provider:'DealMachine',retrievedAt:new Date().toISOString(),coverage:{radiusMiles:1,timeframeMonths:12,sizeTolerance:.30},
     label:'UNVERIFIED CANDIDATES — NOT VALUATION OR APPROVED OFFER',subject:{id:raw.subject.dm_property_id,propertyType:raw.subject.property_type,sqft:raw.subject.sqft,acres:raw.subject.lot_size},
     candidateComps:raw.comps.map(x=>({id:x.dm_property_id,salePrice:x.sale_price,saleDate:x.sale_date,saleType:x.sale_type,sqft:x.sqft,acres:x.lot_size,propertyType:x.property_type,distanceMiles:x.distance,saleVerified:false,conditionVerified:false}))
    });
   }
   if(!['house','land','small_multifamily','commercial_multifamily'].includes(bundle.asset)||!bundle.subject?.id||bundle.subject.id.startsWith('SYNTHETIC'))throw new AcquisitionReviewRequired('Invalid real property evidence');
   const settings=await repo.settings(c),p=settings?.policy as AcquisitionPolicy|null;
   if(p&&(p.radiusMiles>1||p.maxAgeDays>365||p.sizeTolerance>.30))throw new AcquisitionReviewRequired('Approved policy exceeds current provider research coverage (1 mile, 12 months, 30% size tolerance)');
   const resolved=await provider.resolveProperty(address);if('error' in resolved||resolved.match.dm_property_id!==bundle.subject.id)throw new AcquisitionReviewRequired('DealMachine property identity does not match reviewed evidence');
   const fresh=await provider.fetchComps(bundle.subject.id);if(!fresh||fresh.subject.dm_property_id!==bundle.subject.id)throw new AcquisitionReviewRequired('DealMachine property/comps unavailable');
   if(bundle.asset==='house' && (fresh.subject.sqft!==bundle.subject.sqft||fresh.subject.property_type!==bundle.subject.propertyType))throw new AcquisitionReviewRequired('Subject size/type changed since review');
   if(bundle.asset==='land' && fresh.subject.lot_size!==bundle.subject.acres)throw new AcquisitionReviewRequired('Parcel acreage changed since review');
   const retrievedAt=new Date().toISOString();
   // Current DM sale facts replace stale values; human verification remains a
   // separate reference. Unknown/estimated sale types never become verified.
   for(const comp of bundle.comps){
    const raw=fresh.comps.find(x=>x.dm_property_id===comp.id);
    if(!raw || raw.type!=='sale' || raw.sale_price!==comp.salePrice || raw.sale_date!==comp.saleDate || raw.sale_type!==comp.saleType || /estimated/i.test(raw.sale_type??''))throw new AcquisitionReviewRequired('Comparable sale facts changed or are not verified market sales');
    if(bundle.asset==='house' && ('sqft' in comp && raw.sqft!==comp.sqft || 'propertyType' in comp && raw.property_type!==comp.propertyType))throw new AcquisitionReviewRequired('Comparable size/type changed since review');
    if(bundle.asset==='land' && 'acres' in comp && raw.lot_size!==comp.acres)throw new AcquisitionReviewRequired('Comparable acreage changed since review');
    if(bundle.asset==='small_multifamily' && 'sqft' in comp && raw.sqft!==comp.sqft)throw new AcquisitionReviewRequired('Multifamily comparable size changed since review');
    if(comp.source.synthetic||comp.source.provider!=='DealMachine'||!comp.source.reference)throw new AcquisitionReviewRequired('Real DealMachine comp provenance required');
    comp.distanceMiles=raw.distance??NaN;comp.source={...comp.source,retrievedAt};
   }
   return {...bundle,evidenceReview:{reference:rows[0].reviewReference,reviewedAt:rows[0].reviewedAt,expiresAt:rows[0].expiresAt}};
  }
 };
}
