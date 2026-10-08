import {z} from 'zod';
import {assert,id,money,text} from './contracts';
export const PROVISIONAL_REPAIR_MODEL={version:'house-screening-2026-10-07',provisional:true,ratesUsdPerSqft:{light:25,medium:50,heavy:80},contingencyBps:{light:1500,medium:1500,heavy:2000},scopePackages:{light:'Whole-house paint, flooring, fixtures, minor patching and cleanup.',medium:'Light scope plus basic kitchen/bath updates and limited mechanical/electrical/plumbing repairs; unchanged layout.',heavy:'Extensive interior replacement with structure retained; full gut, structural work and additions excluded.'},sources:['https://arvcalc.com/rehab-cost-estimator','https://asremodelingsa.com/whole-home-remodel-cost-san-antonio/','https://flipperforce.com/how-to-flip-houses-curriculum'],sourceReviewDate:'2026-10-07'} as const;
export const APPROVED_REPAIR_MODEL={version:'house-screening-2026-10-07-v2',selectionStatus:'OWNER_APPROVED',approvalReference:'owner:Sentinel_2a28f276b34c819190825f5f22111122',ratesUsdPerSqft:{light:20,medium:40,heavy:65},contingencyBps:{light:1000,medium:1000,heavy:1000},provisional:true,scopePackages:PROVISIONAL_REPAIR_MODEL.scopePackages,sources:PROVISIONAL_REPAIR_MODEL.sources,sourceReviewDate:PROVISIONAL_REPAIR_MODEL.sourceReviewDate} as const;
export const SUPERSEDED_REPAIR_MODEL_VERSIONS:string[]=[PROVISIONAL_REPAIR_MODEL.version,'house-screening-proposed-2026-10-07-2300'];
export const REPAIR_MODEL_SELECTION_PENDING=false;
/** Configuration fragment only; does not invent native policy IDs, terms, expiry or authority. */
export function approvedRepairDefaults(){return {repairModelVersion:APPROVED_REPAIR_MODEL.version,repairRatesUsdPerSqft:{...APPROVED_REPAIR_MODEL.ratesUsdPerSqft},contingencyBps:{...APPROVED_REPAIR_MODEL.contingencyBps},repairRatesReference:APPROVED_REPAIR_MODEL.approvalReference};}
export const majorComponents=['roof','hvac','electrical','plumbing','sewer','windows','remediation'] as const;
const component=z.enum(majorComponents),risk=z.enum(['yes','no','unknown']);
const cost=z.strictObject({id,component:z.enum([...majorComponents,'permits','disposal','project_management','other_project_cost']),amountUsd:money,treatment:z.enum(['outside_base','replaces_base_allowance']),replacedAllowanceUsd:money,scopeReference:text});
export const repairPlan=z.strictObject({scopeArea:z.enum(['whole_house','rooms_only','component_area']),majorComponents:z.array(z.strictObject({component,status:z.enum(['no_work_reported','priced_extra','documented_base_allowance','unknown']),reference:text})).length(majorComponents.length),exceptions:z.strictObject({structural:risk,foundation:risk,fire:risk,flood:risk,fullGut:risk,additions:risk,unresolvedCode:risk}),riskScreenReference:text,knownExtras:z.array(cost).max(30),uncoveredProjectCosts:z.array(cost).max(30),projectCostAssessmentReference:text,separateDealCosts:z.strictObject({financingUsd:money.nullable(),holdingUsd:money.nullable(),sellingUsd:money.nullable(),assignmentUsd:money.nullable()})});
export function repairBudget(raw:unknown,sqft:number,rate:number,contingencyBps:number){
 const p=repairPlan.parse(raw);assert(p.scopeArea==='whole_house','WHOLE_HOUSE_AREA_REQUIRED');
 assert(Object.values(p.exceptions).every(v=>v==='no'),'EXCEPTION_SCOPE_REQUIRES_REVIEW');
 assert(new Set(p.majorComponents.map(m=>m.component)).size===majorComponents.length,'MAJOR_COMPONENT_COVERAGE_REQUIRED');
 assert(p.majorComponents.every(m=>m.status!=='unknown'),'UNKNOWN_MAJOR_COST');
 const all=[...p.knownExtras,...p.uncoveredProjectCosts];
 assert(new Set(all.map(c=>c.id)).size===all.length&&new Set(all.map(c=>c.component)).size===all.length,'DUPLICATE_REPAIR_COST');
 assert(p.knownExtras.every(c=>majorComponents.includes(c.component as typeof majorComponents[number]))&&p.uncoveredProjectCosts.every(c=>!majorComponents.includes(c.component as typeof majorComponents[number])),'COST_BUCKET_MISMATCH');
 for(const m of p.majorComponents){const extra=p.knownExtras.find(c=>c.component===m.component);assert(m.status==='priced_extra'?!!extra&&extra.treatment==='outside_base':!extra||extra.treatment==='replaces_base_allowance'&&m.status==='documented_base_allowance','MAJOR_COST_SCOPE_MISMATCH');}
 for(const c of all)assert(c.treatment==='outside_base'?c.replacedAllowanceUsd===0:c.replacedAllowanceUsd>0,'COST_OVERLAP_UNRESOLVED');
 const baseCents=Math.round(sqft*Math.round(rate*100)),extrasCents=all.reduce((sum,c)=>sum+Math.round(c.amountUsd*100),0),replacedCents=all.reduce((sum,c)=>sum+Math.round(c.replacedAllowanceUsd*100),0);
 assert([baseCents,extrasCents,replacedCents].every(Number.isSafeInteger)&&replacedCents<=baseCents,'REPAIR_PRECISION_OR_ALLOWANCE_INVALID');
 const subtotalCents=baseCents-replacedCents+extrasCents;
 assert(Number.isSafeInteger(subtotalCents*(10000+contingencyBps)),'REPAIR_PRECISION_OR_ALLOWANCE_INVALID');
 const totalCents=Math.round(subtotalCents*(10000+contingencyBps)/10000);
 return {wholeHouseBaseUsd:baseCents/100,replacedAllowancesUsd:replacedCents/100,knownExtrasUsd:p.knownExtras.reduce((sum,c)=>sum+Math.round(c.amountUsd*100),0)/100,uncoveredProjectCostsUsd:p.uncoveredProjectCosts.reduce((sum,c)=>sum+Math.round(c.amountUsd*100),0)/100,repairSubtotalUsd:subtotalCents/100,contingencyBps,contingencyUsd:(totalCents-subtotalCents)/100,repairsUsd:totalCents/100,totalCents,separateDealCosts:p.separateDealCosts,provisional:true,scopeArea:p.scopeArea};
}
