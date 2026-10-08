import {expect} from 'vitest';
import {createGhlNativeQuoteRuntime,nativeCallKey,type AuthorizedGhlTransport,type GhlQuoteBindings,type GhlRequest,type GhlResponse} from './ghl-native-quote';
import {headlessNativeQuoteHandler} from './headless-native-quote';
import {quoteTestFixture,TEST_NOW} from './native-quote.test-fixtures';
import {NATIVE_SCHEMAS,PROPERTY_FIELD_BINDINGS} from './native/native-fields';
import {LOCATION} from './native/contracts';
import type {Sql} from './headless-acquisitions';
import {INSTALLED} from './native-installed-fields';
import {offerKey} from './native/offers';

/** HTTP-shaped fake server exercises the REAL adapter. No GHL call, actual schema grant or native E2E. */
export function fixture(installed=false){
 const f=quoteTestFixture(),s=f.snapshot;if(s.observed.operation!=='reconcile')throw Error('fixture');
 if(installed){s.wholesale.policy.approvalReference=s.observed.bound.policy.approvalReference;s.offer.standing.approvalReference=s.observed.bound.policy.approvalReference;s.offer.wholesalePreparation=s.wholesale;}
 const principal={agency:'TEST_ONLY-agency',location:LOCATION,actor:'TEST_ONLY-machine'};
 const bindings:GhlQuoteBindings={storageMode:'json_envelopes',installedFields:null,locationId:LOCATION,agency:principal.agency,actor:principal.actor,apiVersion:'v3',context:{schemaKey:'custom_objects.test_context',keyField:'call_key',payloadField:'payload'},policy:{schemaKey:'custom_objects.test_policy',payloadField:'payload'},offer:{schemaKey:'custom_objects.test_offer',payloadField:'payload'},quote:{schemaKey:'custom_objects.test_quote',keyField:'request_key',payloadField:'payload',uniqueRequestKeyVerified:true,uniqueConstraintReference:'TEST_ONLY-unique-index',maxPayloadBytes:10000},contact:{dndPath:['dnd'],voiceDndPath:['voiceDnd'],takeoverCustomFieldId:'TEST_ONLY-takeover',customFieldsPath:['customFields'],customFieldIdKey:'id',customFieldValueKey:'value'},relations:{sellerPropertyAssociationId:'TEST_ONLY-seller-property',analysisPropertyAssociationId:'TEST_ONLY-analysis-property',evidenceAnalysisAssociationId:'TEST_ONLY-evidence-analysis',arrayPath:['relations'],associationIdKey:'associationId',firstRecordIdKey:'firstRecordId',secondRecordIdKey:'secondRecordId'},verification:{fieldMappingReference:'TEST_ONLY-mapping',readScopeReference:'TEST_ONLY-read',writeScopeReference:'TEST_ONLY-write',restrictedWritersReference:'TEST_ONLY-restricted',searchAndPagingReference:'TEST_ONLY-paging',contactHoldReference:'TEST_ONLY-holds',relationShapeReference:'TEST_ONLY-relations'}};
 type RecordRow={id:string;properties:Record<string,unknown>;locationId:string;objectKey:string};
 const records=new Map<string,Map<string,RecordRow>>();
 function seed(schema:string,id:string,properties:Record<string,unknown>){if(!records.has(schema))records.set(schema,new Map());const row={id,properties:structuredClone(properties),locationId:LOCATION,objectKey:schema};records.get(schema)!.set(id,row);return row;}
 if(installed){bindings.storageMode='installed_fields';bindings.installedFields={policyConfigurationScope:'TEST_ONLY_FULL_POLICY',approvedOfferStates:['TEST_ONLY_APPROVED'],ceilingSchema:INSTALLED.ceiling,contextEventType:'QUOTE_CONTEXT_SNAPSHOT',quoteEventType:'QUOTE_DECISION_RECORDED'};bindings.context={schemaKey:INSTALLED.event,keyField:'event_key',payloadField:'canonical_event'};bindings.quote={...bindings.quote,schemaKey:INSTALLED.event,keyField:'event_key',payloadField:'canonical_event'};bindings.policy={schemaKey:INSTALLED.policy};bindings.offer={schemaKey:INSTALLED.offer};}
 const context=seed(bindings.context.schemaKey,'TEST_ONLY-context',{[bindings.context.keyField]:nativeCallKey(principal,f.request),[bindings.context.payloadField]:JSON.stringify({principal,policyRecordId:s.observed.bound.context.policyRecordId,offerRecordId:'TEST_ONLY-offer',...(installed?{ceilingRecordId:s.offer.ceiling.recordId}:{}),snapshot:s}),...(installed?{event_location_id:LOCATION,event_type:'QUOTE_CONTEXT_SNAPSHOT',property_record_id:f.request.property_record_id}:{})});
 const policy=seed(bindings.policy.schemaKey,s.observed.bound.context.policyRecordId,{payload:JSON.stringify({principal,compPolicy:s.observed.bound.policy,adoption:s.compPolicyAdoption,wholesalePolicy:s.wholesale.policy})});
 const offer=seed(bindings.offer.schemaKey,'TEST_ONLY-offer',{payload:JSON.stringify({principal,offer:s.offer})});
 if(installed){const p=s.observed.bound.policy,w=s.wholesale.policy,t=s.offer.standing,pk=s.offer.packet,c=s.offer.ceiling;const terms=(t:typeof pk.terms)=>({closing_date:t.closingDate,deposit_usd:t.depositUsd,inspection_days:t.inspectionDays,assignment_allowed:String(t.assignmentAllowed),financing:t.financing,seller_concessions_usd:t.sellerConcessionsUsd});
  policy.properties={policy_key:'TEST_ONLY-policy-key',configuration_scope:'TEST_ONLY_FULL_POLICY',version:p.version,approval_reference:p.approvalReference,approved_by:p.approvedBy,expires_at:p.expiresAt,revoked:String(p.revoked),max_income_sales_difference:p.maxIncomeSalesDifference,min_comps:p.minComps,size_tolerance:p.sizeTolerance,radius_miles:p.radiusMiles,max_source_age_hours:p.maxSourceAgeHours,max_age_days:p.maxAgeDays,house_basis:p.houseBasis,comp_price_basis:p.compPriceBasis,crosscheck_approval_reference:p.crosscheckApprovalReference,estimate_acceptance_reference:p.estimateAcceptanceReference,repair_model_version:w.repairModelVersion,repair_rates_reference:w.repairRatesReference,repair_light_usd_per_sqft:w.repairRatesUsdPerSqft.light,repair_medium_usd_per_sqft:w.repairRatesUsdPerSqft.medium,repair_heavy_usd_per_sqft:w.repairRatesUsdPerSqft.heavy,contingency_light_bps:w.contingencyBps.light,contingency_medium_bps:w.contingencyBps.medium,contingency_heavy_bps:w.contingencyBps.heavy,property_record_id:t.propertyRecordId,recipient_id:t.recipientId,asset:t.asset,strategy:t.strategy,min_price_usd:t.minPriceUsd,max_price_usd:t.maxPriceUsd,...terms(t.terms)};
  offer.properties={packet_key:offerKey(pk),property_record_id:pk.propertyRecordId,provider_property_id:pk.providerPropertyId,property_version:pk.propertyVersion,recipient_id:pk.recipientId,asset:pk.asset,strategy:pk.strategy,analysis_record_id:pk.analysisRecordId,analysis_version:pk.analysisVersion,policy_record_id:pk.policyRecordId,policy_version:pk.policyVersion,price_usd:pk.priceUsd,revision:pk.revision,...terms(pk.terms),approval_state:'TEST_ONLY_APPROVED',reservation_state:'TEST_ONLY_UNUSED',delivery_state:'TEST_ONLY_UNSENT'};
  seed(INSTALLED.ceiling,c.recordId,{ceiling_key:'TEST_ONLY-ceiling-key',source_reference:c.sourceReference,approved_by:c.approvedBy,property_record_id:c.propertyRecordId,analysis_record_id:c.analysisRecordId,analysis_version:c.analysisVersion,policy_record_id:c.policyRecordId,policy_version:c.policyVersion,expires_at:c.expiresAt,valuation_basis:c.valuationBasis,ceiling_usd:c.ceilingUsd});
 }
 const nativeProperty=s.observed.bound.context.property;
 const property=seed(NATIVE_SCHEMAS.property,f.request.property_record_id,Object.fromEntries(Object.entries(PROPERTY_FIELD_BINDINGS).map(([key,normalized])=>[key,nativeProperty[normalized]])));
 const analysis=seed(NATIVE_SCHEMAS.analysis,f.request.analysis_id,s.observed.readback.analysis.properties);
 for(const row of s.observed.readback.evidence)seed(NATIVE_SCHEMAS.evidence,row.recordId,row.properties);
 const contact={id:f.request.contact_id,locationId:LOCATION,dnd:false,voiceDnd:false,customFields:[{id:'TEST_ONLY-takeover',value:'false'}]};
 const relations=[...s.observed.bound.context.associatedPropertyRecordIds.map(property=>({associationId:bindings.relations.sellerPropertyAssociationId,firstRecordId:f.request.contact_id,secondRecordId:property})),{associationId:bindings.relations.analysisPropertyAssociationId,firstRecordId:f.request.analysis_id,secondRecordId:f.request.property_record_id},...s.observed.readback.evidence.map(e=>({associationId:bindings.relations.evidenceAnalysisAssociationId,firstRecordId:e.recordId,secondRecordId:f.request.analysis_id}))];
 const calls:GhlRequest[]=[];let creations=0;
 let intercept:((request:GhlRequest)=>GhlResponse|undefined)|undefined;
 const transport:AuthorizedGhlTransport=async request=>{
  calls.push(request);const intercepted=intercept?.(request);if(intercepted)return structuredClone(intercepted);
  const parts=request.path.split('/').filter(Boolean);
  if(parts[0]==='contacts')return {status:200,body:{contact:structuredClone(contact)}};
  if(parts[0]==='associations'){const skip=Number(request.query?.skip),limit=Number(request.query?.limit),associations=request.query?.associationIds as string[];return {status:200,body:{relations:structuredClone(relations.filter(row=>associations.includes(row.associationId)&&(row.firstRecordId===parts[2]||row.secondRecordId===parts[2])).slice(skip,skip+limit))}};}
  const schema=decodeURIComponent(parts[1]),table=records.get(schema)??new Map();
  if(request.method==='GET'){const record=table.get(parts[3]);return record?{status:200,body:{record:structuredClone(record)}}:{status:404,body:{}};}
  if(parts[3]==='search'){const body=request.body as {query:string;page:number;pageLimit:number};const [key,value]=body.query.split(':');const matches=[...table.values()].filter(r=>r.properties[key]===value);return {status:200,body:{records:structuredClone(matches.slice((body.page-1)*body.pageLimit,body.page*body.pageLimit)),total:matches.length}};}
  expect(schema).toBe(bindings.quote.schemaKey);const body=request.body as {locationId:string;properties:Record<string,unknown>};expect(body.locationId).toBe(LOCATION);
  if([...table.values()].some(r=>r.properties[bindings.quote.keyField]===body.properties[bindings.quote.keyField]))return {status:400,body:{error:'TEST_ONLY unique conflict'}};
  creations++;const row=seed(schema,`TEST_ONLY-quote-${creations}`,body.properties);return {status:201,body:{record:structuredClone(row)}};
 };
 const sql:Sql={query:async<T>()=>[principal] as T[]};
 const handler=()=>headlessNativeQuoteHandler(sql,createGhlNativeQuoteRuntime(transport,bindings,()=>new Date(TEST_NOW)),true,()=>new Date(TEST_NOW));
 const request=()=>new Request('https://example.invalid/api/acquisitions/quote',{method:'POST',headers:{authorization:'Bearer TEST_ONLY-local-token-not-a-credential','content-type':'application/json'},body:JSON.stringify(f.request)});
 return {...f,principal,bindings,records,seed,context,policy,offer,property,analysis,contact,relations,calls,transport,handler,request,creations:()=>creations,setIntercept:(fn:typeof intercept)=>{intercept=fn;}};
}
