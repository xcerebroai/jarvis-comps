/** Public-docs property projections only; no provider calls, live binding or comps conversion. */
import {z} from 'zod';
import {assert,date,failure,id,instant,LOCATION,nonnegative,parseInput,same,text} from './contracts';
export const LIVE_PROPERTY_BINDING_VERIFIED=false;
export const PROPERTY_DOCS={address:'https://api.docs.dealmachine.com/api-reference/enrichment/enrich-by-address',get:'https://api.docs.dealmachine.com/api-reference/properties/get-property',catalog:'https://api.docs.dealmachine.com/reference/property-fields',format:'https://api.docs.dealmachine.com/concepts/response-format',filters:'https://api.docs.dealmachine.com/api-reference/filters/list-filters'} as const;
const optionIds=z.array(z.number().int().nonnegative().safe()).max(100).refine(v=>new Set(v).size===v.length);
const count=z.number().int().nonnegative().safe();
const fields={
 living_area_sqft:nonnegative,lot_size_acres:nonnegative,num_units:count,num_commercial_units:count,
 num_bedrooms:count,num_bathrooms:nonnegative,year_built:z.number().int().positive().max(9999),
 last_sale_price:nonnegative,last_sale_date:date,last_sale_doc_type:optionIds,
 estimated_value:nonnegative,mls_current_listing_price:nonnegative,building_condition:optionIds,property_type:optionIds,
} as const;
export const catalogFieldIds=Object.keys(fields) as (keyof typeof fields)[];
const fieldId=z.enum(catalogFieldIds as [keyof typeof fields,...(keyof typeof fields)[]]);
const selections=z.array(fieldId).min(1).max(catalogFieldIds.length).refine(v=>new Set(v).size===v.length);
const addressInput=z.strictObject({full_address:text});
const base={dm_property_id:id,full_address:text};
const catalogProjection=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.nullable().optional()])) as {[K in keyof typeof fields]:z.ZodOptional<z.ZodNullable<typeof fields[K]>>};
const warning=z.strictObject({code:text,message:text,hint:z.strictObject({parsed_street:text}).optional()});
const matched=z.strictObject({...base,...catalogProjection,input:addressInput,matched:z.literal(true),match_warning:warning.optional()});
const unmatched=z.strictObject({input:addressInput,matched:z.literal(false),match_failure:z.strictObject({code:text,reason:text}),match_warning:warning.optional()});
// GET's endpoint-specific response field is last_sale_amount; it is NOT an alias for catalog last_sale_price.
const {last_sale_price:excludedCatalogSale,...getFields}=catalogProjection;
void excludedCatalogSale;
const getProjection=z.strictObject({...base,...getFields,lot_size_sqft:nonnegative.nullable().optional(),last_sale_amount:nonnegative.nullable().optional()});
const metadata=z.strictObject({reference:text,retrievedAt:instant,expiresAt:instant,filters:z.array(z.strictObject({filter_id:z.enum(['property_type','building_condition','last_sale_doc_type']),type:z.literal('MULTI_SELECT'),source_type:z.literal('properties'),options:z.array(z.strictObject({option_id:z.union([z.string().min(1).max(200),z.number().int().nonnegative().safe()]),label:text})).max(500)})).max(3)});
const shared={contract:z.literal('jarvis.documented-property.v1'),mode:z.enum(['synthetic_fixture','real']),locationId:z.literal(LOCATION),nativePropertyRecordId:id,now:instant,retrievedAt:instant,sourceReference:text,metadata:metadata.nullable()};
export const propertyAdapterInput=z.discriminatedUnion('operation',[
 z.strictObject({...shared,operation:z.literal('address'),request:z.strictObject({data:z.array(addressInput).length(1),fields:selections,contact_audience:z.literal('none')}),responseProjection:z.strictObject({data:z.array(z.discriminatedUnion('matched',[matched,unmatched])).length(1),totals:z.strictObject({submitted:count,matched:count,unmatched:count})})}),
 z.strictObject({...shared,operation:z.literal('get_property'),request:z.strictObject({id,query:z.strictObject({enrich:z.literal(true),contact_audience:z.literal('none'),fields:z.string().min(1).max(1000).refine(v=>selections.safeParse(v.split(',')).success)})}),responseProjection:z.strictObject({data:getProjection})}),
]);
const units:Record<string,string>={living_area_sqft:'sqft',lot_size_acres:'acre',lot_size_sqft:'sqft',num_units:'count',num_commercial_units:'count',num_bedrooms:'count',num_bathrooms:'count',year_built:'year',last_sale_date:'date',property_type:'option_ids',building_condition:'option_ids',last_sale_doc_type:'option_ids'};
const categories=new Set(['property_type','building_condition','last_sale_doc_type']);
const amountFields=new Set(['last_sale_price','last_sale_amount','estimated_value','mls_current_listing_price']);
export type PropertyObservation={field:string;path:string;presence:'MISSING'|'NULL'|'VALUE';value:string|number|number[]|null;unit:string;meaning:string;labels:string[]|null;metadataReference:string|null};
export function mapDocumentedProperty(raw:unknown){
 const x=propertyAdapterInput.parse(raw);
 assert(Date.parse(x.retrievedAt)<=Date.parse(x.now),'PROPERTY_OBSERVATION_FUTURE');
 const body=x.operation==='address'?x.responseProjection.data[0]:x.responseProjection.data;
 if(x.operation==='address'){
  const row=x.responseProjection.data[0],totals=x.responseProjection.totals;
  assert(totals.submitted===1&&totals.matched===(row.matched?1:0)&&totals.unmatched===(row.matched?0:1),'ADDRESS_TOTALS_MISMATCH');
  assert(same(row.input,x.request.data[0]),'ADDRESS_INPUT_ECHO_MISMATCH');
  assert(!row.match_warning,'ADDRESS_MATCH_WARNING_REQUIRES_REVIEW');
  assert(row.matched,'ADDRESS_UNMATCHED');
 }
 assert('dm_property_id' in body,'PROPERTY_ID_REQUIRED');
 if(x.operation==='get_property')assert(body.dm_property_id===x.request.id,'PROPERTY_LOOKUP_ID_MISMATCH');
 assert(x.nativePropertyRecordId!==body.dm_property_id,'NATIVE_PROVIDER_ID_CONFLATION');
 if(x.mode==='synthetic_fixture')assert(body.dm_property_id.startsWith('SYNTHETIC-')&&body.full_address.startsWith('SYNTHETIC-')&&x.sourceReference.startsWith('SYNTHETIC-'),'PROPERTY_FIXTURE_IDENTITY_REQUIRED');
 else assert(LIVE_PROPERTY_BINDING_VERIFIED,'LIVE_PROPERTY_BINDING_UNVERIFIED');
 if(x.metadata){assert(Date.parse(x.metadata.retrievedAt)<=Date.parse(x.now)&&Date.parse(x.now)<Date.parse(x.metadata.expiresAt),'CATEGORY_METADATA_STALE');assert(new Set(x.metadata.filters.map(f=>f.filter_id)).size===x.metadata.filters.length,'DUPLICATE_CATEGORY_METADATA');for(const f of x.metadata.filters)assert(new Set(f.options.map(o=>`${typeof o.option_id}:${o.option_id}`)).size===f.options.length,'DUPLICATE_CATEGORY_OPTION');}
 const path=x.operation==='address'?'$.data[0]':'$.data';
 const observedFields=x.operation==='address'?catalogFieldIds:[...catalogFieldIds.filter(k=>k!=='last_sale_price'),'lot_size_sqft','last_sale_amount'];
 const observations:PropertyObservation[]=[],blockers=new Set<string>(['REAL_COMPS_MAPPING_UNAVAILABLE','LIVE_PROPERTY_BINDING_UNVERIFIED']);
 if(x.operation==='get_property')blockers.add('CATALOG_LAST_SALE_PRICE_VS_GET_LAST_SALE_AMOUNT');
 const projected=body as Record<string,unknown>;
 for(const field of observedFields){
  const value=projected[field],presence=value===undefined?'MISSING':value===null?'NULL':'VALUE';
  let labels:string[]|null=null,metadataReference:string|null=null;
  if(categories.has(field)&&presence==='VALUE'){
   const filter=x.metadata?.filters.find(f=>f.filter_id===field);
   if(!filter)blockers.add('CATEGORY_METADATA_REQUIRED');
   else{const found=(value as number[]).map(option=>filter.options.find(o=>o.option_id===option)?.label);if(found.some(v=>v===undefined))blockers.add('CATEGORY_OPTION_UNRESOLVED');else{labels=found as string[];metadataReference=x.metadata!.reference;}}
  }
  const meaning=field==='estimated_value'?'PROVIDER_ESTIMATE':field==='mls_current_listing_price'?'LIST_PRICE':field.startsWith('last_sale_')?'PROVIDER_REPORTED_SALE_HISTORY':field==='building_condition'?'CONDITION_CATEGORY_NOT_RENOVATION_PROOF':'PROPERTY_CHARACTERISTIC';
  observations.push({field,path:`${path}.${field}`,presence,value:value===undefined?null:value as PropertyObservation['value'],unit:units[field]??(amountFields.has(field)?'provider_amount_currency_unverified':'unknown'),meaning,labels,metadataReference});
 }
 const requested=x.operation==='address'?x.request.fields:x.request.query.fields.split(',');
 if(requested.some(k=>!Object.hasOwn(projected,k)))blockers.add('REQUESTED_FIELD_MISSING');
 return {status:'SYNTHETIC_DOCUMENTED_PROPERTY_OBSERVATION',operation:x.operation,sourceDocumentation:x.operation==='address'?PROPERTY_DOCS.address:PROPERTY_DOCS.get,sourceReference:x.sourceReference,retrievedAt:x.retrievedAt,nativePropertyRecordId:x.nativePropertyRecordId,providerPropertyId:body.dm_property_id,canonicalAddress:body.full_address,identityStatus:'PROVIDER_REPORTED_ONLY',observations,blockers:[...blockers],saleVerified:false,renovatedComparable:false,assetClassification:null,comps:null,valuation:null,outboundEnabled:false,authorizationRecorded:false,synthetic:true};
}
export function propertyWorkflow(input:unknown){try{return mapDocumentedProperty(parseInput(input));}catch(e){return failure(e);}}
