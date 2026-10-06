import {analyzeHouseValue} from './acquisition-analysis';
import type {AcquisitionSubject,AcquisitionComp,AcquisitionPolicy} from './acquisition-analysis';
import {analyzeLand,analyzeSmallMultifamily,analyzeCommercialMultifamily} from './acquisition-assets';
import type {LandFacts,LandComp,IncomeFacts,SmallMultiComp} from './acquisition-assets';
type AssetBundle=
 |{asset:'house';subject:AcquisitionSubject;comps:AcquisitionComp[]}
 |{asset:'land';subject:LandFacts;comps:LandComp[]}
 |{asset:'small_multifamily';subject:{id:string;identityVerified:boolean;units:number;sqft:number};comps:SmallMultiComp[];income:IncomeFacts}
 |{asset:'commercial_multifamily';subject:{id:string;identityVerified:boolean;units:number};comps:[];income:IncomeFacts};
export type AcquisitionBundle=AssetBundle & {evidenceReview?:{reference:string;reviewedAt:string;expiresAt:string}};
export function analyzeBundle(data:AcquisitionBundle,policy:AcquisitionPolicy&{maxIncomeSalesDifference?:number;crosscheckApprovalReference?:string},now:Date,synthetic:boolean){
 switch(data.asset){
  case 'house':return analyzeHouseValue(data.subject,data.comps,policy,now,synthetic);
  case 'land':return analyzeLand(data.subject,data.comps,policy,now,synthetic);
  case 'small_multifamily':return analyzeSmallMultifamily(data.subject,data.comps,data.income,{...policy,maxIncomeSalesDifference:policy.maxIncomeSalesDifference??NaN,crosscheckApprovalReference:policy.crosscheckApprovalReference??''},now,synthetic);
  case 'commercial_multifamily':return analyzeCommercialMultifamily(data.subject,data.income,policy,now,synthetic);
 }
}
