/** Sanitized observed prices with fabricated native/unit/policy/authority bindings.
 * This exercises HTTP composition. No live quote, client terms, native durability or adopted comp policy. */
import {observedReviewExample} from './native/observed-examples';
import {estimatedFixture,wholesaleFixture} from './native/estimated-fixtures';
import {fixtureLimits,offerFixture} from './native/fixtures';
import {stableKey} from './native/storage';
import {observedWorkflow} from './native/observed-provider';
import {calculateWholesale} from './native/acquisition-policy';
import {approvedRepairDefaults} from './native/repair-model';
import {quoteRequest,quoteSnapshot} from './native-quote-contract';

export const TEST_NOW='2026-10-08T00:00:00.000Z';
export function quoteTestFixture(){
 const x=observedReviewExample(),f=estimatedFixture(),c=f.context;
 Object.assign(c,{now:TEST_NOW,contactId:'TEST_ONLY-seller',associatedPropertyRecordIds:['TEST_ONLY-property','TEST_ONLY-property-two'],analysisRecordId:'TEST_ONLY-analysis',policyRecordId:'TEST_ONLY-policy',expectedCurrentAnalysisId:'TEST_ONLY-analysis'});
 Object.assign(c.property,{recordId:'TEST_ONLY-property',providerPropertyId:'prop_125714946',canonicalAddress:'11311 Begonia Rock San Antonio, TX 78245',sourceIdentityReference:'TEST_ONLY-identity',currentAnalysisId:'TEST_ONLY-analysis'});
 c.analysisKey=stableKey([c.locationId,c.property.recordId,c.property.providerPropertyId,c.property.propertyVersion,c.analysisVersion,c.policyRecordId,c.policyVersion,c.sourceVersion,c.eventId]);
 Object.assign(f.policy,{recordId:c.policyRecordId,approvalReference:'TEST_ONLY-policy',approvedBy:'TEST_ONLY-owner',estimateAcceptanceReference:x.pair.pricingSelection.acceptanceReference,estimatedSaleTypes:['Estimated Sales Price'],expiresAt:'2026-10-08T23:00:00.000Z'});
 const bound={context:c,policy:f.policy,bindings:{classification:{asset:'house',propertyType:'Single Family',reference:'TEST_ONLY-classifier'},currency:{value:'USD',reference:'TEST_ONLY-currency'},livingArea:{value:'sqft',reference:'TEST_ONLY-area'},distance:{value:'mile',reference:'TEST_ONLY-distance'},lot:null,addressCapture:{reference:'TEST_ONLY-address-capture',capturedAt:'2026-10-07T22:40:00.000Z',eligibleUntil:'2026-10-08T22:40:00.000Z'},compsCapture:{reference:'TEST_ONLY-comps-capture',capturedAt:'2026-10-07T22:40:00.000Z',eligibleUntil:'2026-10-08T22:40:00.000Z'}}};
 const run=(input:unknown)=>observedWorkflow({requestJson:JSON.stringify(input)});
 const plan=run({...x,operation:'prepare',bound,fieldLimits:fixtureLimits});if(!('analysis' in plan))throw Error(JSON.stringify(plan));
 const calculated=run({...x,operation:'analyze',bound});if(!('valueUsd' in calculated))throw Error(JSON.stringify(calculated));
 const readback={contact:{contactId:c.contactId,associatedPropertyRecordIds:c.associatedPropertyRecordIds,contactDnd:false,contactTakeover:false},property:c.property,policy:f.policy,analysis:{...plan.analysis,properties:{...plan.analysis.properties,status:'READY',completion_state:'COMPLETE'}},evidence:plan.evidence.map((row,i)=>({...row,recordId:`TEST_ONLY-evidence-${i}`})),allPagesRead:true};
 const w=wholesaleFixture();w.context=c;
 Object.assign(w.policy,{recordId:c.policyRecordId,version:c.policyVersion,approvalReference:'TEST_ONLY-formula-policy',approvedBy:'TEST_ONLY-owner',expiresAt:f.policy.expiresAt,estimateAcceptanceReference:calculated.estimateAcceptanceReference,...approvedRepairDefaults()});
 Object.assign(w.discovery,{contactId:c.contactId,propertyRecordId:c.property.recordId,repairScope:'light'});
 w.subject.sqft=x.pair.compsProjection.data[0].subject.sqft;
 Object.assign(w.analysis,{recordId:c.analysisRecordId,propertyRecordId:c.property.recordId,providerPropertyId:c.property.providerPropertyId,version:c.analysisVersion,policyRecordId:c.policyRecordId,policyVersion:c.policyVersion,arvUsd:calculated.valueUsd,basis:calculated.basis,estimateAcceptanceReference:calculated.estimateAcceptanceReference,expiresAt:calculated.expiresAt});
 const amount=calculateWholesale(w).requestedOfferUsd,o=offerFixture();o.context=c;o.wholesalePreparation=w;
 Object.assign(o.packet,{propertyRecordId:c.property.recordId,providerPropertyId:c.property.providerPropertyId,propertyVersion:c.property.propertyVersion,recipientId:c.contactId,analysisRecordId:c.analysisRecordId,analysisVersion:c.analysisVersion,policyRecordId:c.policyRecordId,policyVersion:c.policyVersion,priceUsd:amount});
 Object.assign(o.standing,{recordId:c.policyRecordId,version:c.policyVersion,approvalReference:'TEST_ONLY-offer-authority',approvedBy:'TEST_ONLY-owner',expiresAt:f.policy.expiresAt,propertyRecordId:c.property.recordId,recipientId:c.contactId,minPriceUsd:amount-1000,maxPriceUsd:amount+2000,acceptedValuationBases:[calculated.basis],estimateAcceptanceReference:calculated.estimateAcceptanceReference});
 Object.assign(o.ceiling,{propertyRecordId:c.property.recordId,analysisRecordId:c.analysisRecordId,analysisVersion:c.analysisVersion,policyRecordId:c.policyRecordId,policyVersion:c.policyVersion,expiresAt:f.policy.expiresAt,valuationBasis:calculated.basis,ceilingUsd:amount+1000});
 Object.assign(o.analysis,{recordId:c.analysisRecordId,propertyRecordId:c.property.recordId,version:c.analysisVersion,policyRecordId:c.policyRecordId,policyVersion:c.policyVersion,expiresAt:calculated.expiresAt,valuationBasis:calculated.basis,estimateAcceptanceReference:calculated.estimateAcceptanceReference});
 const request=quoteRequest.parse({request_id:'TEST_ONLY-request',call_id:'TEST_ONLY-call',contact_id:c.contactId,property_record_id:c.property.recordId,analysis_id:c.analysisRecordId,analysis_version:c.analysisVersion});
 const snapshot=quoteSnapshot.parse({revision:'TEST_ONLY-revision',nativeReadReference:'TEST_ONLY-native-read',callBinding:{callId:request.call_id,contactId:c.contactId,propertyRecordId:c.property.recordId,analysisRecordId:c.analysisRecordId,analysisVersion:c.analysisVersion,locationId:c.locationId,expiresAt:'2026-10-08T01:00:00.000Z',reference:'TEST_ONLY-call-binding'},compPolicyAdoption:{status:'ADOPTED',policyRecordId:c.policyRecordId,policyVersion:c.policyVersion,approvalReference:f.policy.approvalReference,approvedBy:f.policy.approvedBy,adoptedAt:'2026-10-07T22:00:00.000Z',revoked:false},observed:{...x,operation:'reconcile',bound,fieldLimits:fixtureLimits,readback},wholesale:w,offer:o});
 return {request,snapshot,amount};
}
