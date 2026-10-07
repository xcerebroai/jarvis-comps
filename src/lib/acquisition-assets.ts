/** Land and multifamily require distinct evidence and valuation methods. */
import {AcquisitionReviewRequired} from './acquisition-analysis';
import type {AcquisitionPolicy,Source} from './acquisition-analysis';
type Sale={id:string;salePrice:number;saleDate:string;saleType:string;distanceMiles:number;saleVerified:boolean;source:Source};
export type LandFacts={id:string;identityVerified:boolean;acres:number;zoning:string;legalAccess:string;utilities:string;floodStatus:string;boundaryReference:string};
export type LandComp=Sale & Omit<LandFacts,'identityVerified'>;
export type IncomeFacts={grossScheduledAnnualRent:number;vacancyRate:number;annualOperatingExpenses:number;annualDebtService:number;immediateCapitalWork:number;capRate:number;unitCount:number;rentRollReference:string;operatingStatementReference:string;occupancyReference:string;capitalWorkReference:string;sources:Record<string,Source>};
export type SmallMultiComp=Sale & {units:number;sqft:number;renovatedComparable:boolean};
function fail(ok:unknown,message:string):asserts ok{if(!ok)throw new AcquisitionReviewRequired(message);}
function numeric(n:number,positive=false){return typeof n==='number'&&Number.isFinite(n)&&(positive?n>0:n>=0);}
function dollars(n:number){const cents=Math.round(n*100);fail(Number.isSafeInteger(cents),'Invalid monetary precision');return(cents/100).toFixed(2);}
function median(values:number[]){const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function sourceOK(s:Source,p:AcquisitionPolicy,now:Date,synthetic:boolean,comp=false){
 const age=(now.getTime()-Date.parse(s?.retrievedAt))/3600000;
 return Boolean(s?.reference&&s.provider&&/[zZ]|[+-]\d\d:\d\d$/.test(s.retrievedAt)&&Number.isFinite(age)&&age>=0&&age<=p.maxSourceAgeHours&&s.synthetic===synthetic&&(synthetic||!comp||s.provider==='DealMachine'));
}
function policyOK(p:AcquisitionPolicy){fail(p.approvalReference&&numeric(p.maxAgeDays,true)&&numeric(p.maxSourceAgeHours,true)&&numeric(p.radiusMiles,true)&&numeric(p.sizeTolerance)&&p.sizeTolerance<1&&Number.isInteger(p.minComps)&&p.minComps>=3&&p.verifiedSaleTypes.length,'Approved asset comp policy required');}
function sales<T extends Sale>(rows:T[],p:AcquisitionPolicy,now:Date,synthetic:boolean,match:(row:T)=>boolean){
 policyOK(p);fail(typeof synthetic==='boolean'&&Number.isFinite(now.getTime()),'Valid analysis context required');
 const seen=new Set<string>(),accepted:T[]=[],excluded:{id:string;reason:string}[]=[];
 for(const c of rows){const days=(now.getTime()-Date.parse(c.saleDate))/86400000;
 const valid=Boolean(c.id&&!seen.has(c.id)&&numeric(c.salePrice,true)&&numeric(c.distanceMiles)&&c.distanceMiles<=p.radiusMiles&&Number.isFinite(days)&&days>=0&&days<=p.maxAgeDays&&c.saleVerified&&!/estimated/i.test(c.saleType)&&p.verifiedSaleTypes.includes(c.saleType)&&sourceOK(c.source,p,now,synthetic,true)&&match(c));
 const reasons:string[]=[];
 if(!c.id)reasons.push('Missing sale identity');
 if(seen.has(c.id))reasons.push('Duplicate sale identity');
 if(!numeric(c.salePrice,true))reasons.push('Invalid sale price');
 if(!numeric(c.distanceMiles)||c.distanceMiles>p.radiusMiles)reasons.push('Outside approved distance');
 if(!Number.isFinite(days)||days<0||days>p.maxAgeDays)reasons.push('Outside approved sale recency');
 if(!c.saleVerified||/estimated/i.test(c.saleType)||!p.verifiedSaleTypes.includes(c.saleType))reasons.push('Unsupported actual-sale classification');
 if(!sourceOK(c.source,p,now,synthetic,true))reasons.push('Source provenance or freshness failed');
 if(!match(c))reasons.push('Asset matching facts outside approved policy');
 seen.add(c.id);if(valid)accepted.push(c);else excluded.push({id:c.id,reason:reasons.join('; ')});}
 fail(accepted.length>=p.minComps,'Insufficient verified asset comps');return{accepted,excluded};
}
export function analyzeLand(subject:LandFacts,rows:LandComp[],policy:AcquisitionPolicy,now:Date,synthetic:boolean){
 fail(subject.id&&subject.identityVerified&&numeric(subject.acres,true)&&subject.zoning&&subject.legalAccess&&subject.utilities&&subject.floodStatus&&subject.boundaryReference,'Verified acreage, zoning, legal access, utilities, flood and boundaries required');
 const {accepted,excluded}=sales(rows,policy,now,synthetic,c=>numeric(c.acres,true)&&Math.abs(c.acres/subject.acres-1)<=policy.sizeTolerance&&c.zoning===subject.zoning&&c.legalAccess===subject.legalAccess&&c.utilities===subject.utilities&&c.floodStatus===subject.floodStatus&&Boolean(c.boundaryReference));
 const perAcre=median(accepted.map(c=>c.salePrice/c.acres));
 return{status:'INTERNAL_REVIEW',method:'land_verified_sales_per_acre',propertyId:subject.id,valueUsd:dollars(perAcre*subject.acres),calculation:{medianPerAcre:perAcre,acres:subject.acres},usedCompIds:accepted.map(c=>c.id),sources:accepted.map(c=>c.source),excluded,synthetic,outboundEnabled:false,offerApproved:false};
}
export function analyzeIncome(f:IncomeFacts,policy:AcquisitionPolicy,now:Date,synthetic:boolean){
 policyOK(policy);
 const fields=['grossScheduledAnnualRent','vacancyRate','annualOperatingExpenses','annualDebtService','immediateCapitalWork','capRate'] as const;
 fail(Number.isInteger(f.unitCount)&&f.unitCount>=2&&f.rentRollReference&&f.operatingStatementReference&&f.occupancyReference&&f.capitalWorkReference,'Verified unit count, rent roll, operating statement, occupancy and capital work required');
 for(const k of fields)fail(numeric(f[k],k==='capRate'||k==='grossScheduledAnnualRent')&&sourceOK(f.sources[k],policy,now,synthetic),'Verified income/cost/cap-rate evidence required');
 fail(f.vacancyRate<1&&f.capRate<1,'Vacancy/cap-rate outside valid range');
 const effective=f.grossScheduledAnnualRent*(1-f.vacancyRate),noi=effective-f.annualOperatingExpenses;
 fail(noi>0,'Nonpositive NOI requires human review');
 const incomeValue=noi/f.capRate,netValue=incomeValue-f.immediateCapitalWork;
 fail(netValue>0,'Capital work exceeds income value');
 return{noiUsd:dollars(noi),incomeValueUsd:dollars(incomeValue),netCapitalAdjustedValueUsd:dollars(netValue),cashFlowUsd:dollars(noi-f.annualDebtService),dscr:f.annualDebtService>0?noi/f.annualDebtService:null,sources:f.sources,calculation:{grossScheduledRent:f.grossScheduledAnnualRent,vacancyRate:f.vacancyRate,effectiveIncome:effective,operatingExpenses:f.annualOperatingExpenses,capRate:f.capRate,immediateCapitalWork:f.immediateCapitalWork},synthetic,outboundEnabled:false,offerApproved:false};
}
export function analyzeSmallMultifamily(subject:{id:string;identityVerified:boolean;units:number;sqft:number},rows:SmallMultiComp[],income:IncomeFacts,policy:AcquisitionPolicy&{maxIncomeSalesDifference:number;crosscheckApprovalReference:string},now:Date,synthetic:boolean){
 fail(subject.id&&subject.identityVerified&&Number.isInteger(subject.units)&&subject.units>=2&&subject.units<=4&&numeric(subject.sqft,true)&&income.unitCount===subject.units,'Verified 2–4-unit identity and matched rent roll required');
 fail(policy.crosscheckApprovalReference&&numeric(policy.maxIncomeSalesDifference)&&policy.maxIncomeSalesDifference<1,'Approved income/sales sensitivity threshold required');
 const {accepted,excluded}=sales(rows,policy,now,synthetic,c=>c.units===subject.units&&c.renovatedComparable&&numeric(c.sqft,true)&&Math.abs(c.sqft/subject.sqft-1)<=policy.sizeTolerance);
 const value=median(accepted.map(c=>c.salePrice/c.sqft))*subject.sqft,check=analyzeIncome(income,policy,now,synthetic),incomeValue=Number(check.incomeValueUsd),difference=Math.abs(value-incomeValue)/value;
 return{status:difference>policy.maxIncomeSalesDifference?'NEEDS_REVIEW':'INTERNAL_REVIEW',method:'small_multifamily_matched_sales_and_income',propertyId:subject.id,salesValueUsd:dollars(value),income:check,incomeSalesDifference:difference,usedCompIds:accepted.map(c=>c.id),sources:accepted.map(c=>c.source),excluded,synthetic,outboundEnabled:false,offerApproved:false};
}
export function analyzeCommercialMultifamily(subject:{id:string;identityVerified:boolean;units:number},income:IncomeFacts,policy:AcquisitionPolicy,now:Date,synthetic:boolean){
 fail(subject.id&&subject.identityVerified&&Number.isInteger(subject.units)&&subject.units>=5&&income.unitCount===subject.units,'Verified 5+ identity and unit-matched rent roll required');
 return{status:'INTERNAL_REVIEW',method:'commercial_multifamily_noi_cap',propertyId:subject.id,...analyzeIncome(income,policy,now,synthetic)};
}
