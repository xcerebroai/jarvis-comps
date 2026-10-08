/** Native record property maps from the supplied 58-field inventory, not provider response aliases. */
import {z} from 'zod';
import manifest from '../../../native-deliverables/schema-manifest.json';
import {assert,id,LOCATION,property} from './contracts';
export const NATIVE_SCHEMAS={property:'custom_objects.jarvis_acq_properties',analysis:'custom_objects.jarvis_acq_analyses',evidence:'custom_objects.jarvis_acq_analysis_evidence_rows'} as const;
export const PROPERTY_FIELD_BINDINGS={source_identity_ref:'sourceIdentityReference',asset:'asset',canonical_address:'canonicalAddress',provider_property_id:'providerPropertyId',property_key:'propertyKey',held:'held',property_version:'propertyVersion',current_analysis_id:'currentAnalysisId',hold_reason:'holdReason',human_takeover:'humanTakeover',status:'status',current_analysis_version:'currentAnalysisVersion'} as const;
const analysisFields=['policy_version','policy_id','property_key','provider_property_id','property_record_id','analysis_version','analysis_key','expected_evidence_count','rejected_count','accepted_count','public_value_usd','basis','status','expires_at','retrieved_at','source_reference','source_version','completion_state'];
const evidenceFields=['property_type','distance_miles','sqft','sale_price_usd','provider_row_ordinal','sale_date','sale_type','row_kind','exclusion_codes','selection','source_property_id','endpoint_contract_version','expires_at','retrieved_at','source_reference','source_provider','property_record_id','analysis_version','analysis_key','analysis_record_id','evidence_key','fact_value_text','fact_unit','fact_value_number','fact_name','display_address','lot_unit','lot_size'];
const numericFields=new Set(['expected_evidence_count','rejected_count','accepted_count','public_value_usd','distance_miles','sqft','sale_price_usd','provider_row_ordinal','fact_value_number','lot_size']);
export function auditNativeManifest(candidate:typeof manifest=manifest){
 assert(candidate.locationId===LOCATION&&candidate.objects.length===3,'NATIVE_MANIFEST_LOCATION_OR_OBJECT_COUNT');
 const expected=[{key:NATIVE_SCHEMAS.property,fields:Object.keys(PROPERTY_FIELD_BINDINGS)},{key:NATIVE_SCHEMAS.analysis,fields:analysisFields},{key:NATIVE_SCHEMAS.evidence,fields:evidenceFields}],ids=new Set<string>();
 for(const item of expected){const matches=candidate.objects.filter(o=>o.schemaKey===item.key);assert(matches.length===1,'NATIVE_SCHEMA_KEY_MISMATCH');const object=matches[0];assert(object.id&&!ids.has(object.id),'NATIVE_DUPLICATE_ID');ids.add(object.id);assert(Object.keys(object.fields).length===item.fields.length,'NATIVE_FIELD_COUNT_MISMATCH');for(const key of item.fields){const pair=Object.entries(object.fields).find(([k])=>k===key);assert(pair,'NATIVE_FIELD_MISSING');const field=pair[1];assert(field.key===key&&field.mergeKey===`${item.key}.${key}`,'NATIVE_FIELD_BINDING_MISMATCH');assert(field.uiType===(numericFields.has(key)?'Number':'Single line'),'NATIVE_FIELD_TYPE_MISMATCH');assert(field.id&&!ids.has(field.id),'NATIVE_DUPLICATE_ID');ids.add(field.id);}}
 const associations=[{label:'ACQ Property Analysis',from:'JARVIS ACQ Analysis',to:'JARVIS ACQ Property'},{label:'ACQ Analysis Evidence',from:'JARVIS ACQ Analysis Evidence',to:'JARVIS ACQ Analysis'}];
 assert(candidate.associations.length===associations.length,'NATIVE_ASSOCIATION_COUNT_MISMATCH');
 for(const expected of associations){const matches=candidate.associations.filter(a=>a.label===expected.label);assert(matches.length===1&&matches[0].from===expected.from&&matches[0].to===expected.to&&matches[0].fromToMax===1&&matches[0].toFrom==='Many','NATIVE_ASSOCIATION_BINDING_MISMATCH');}
 return {locationId:LOCATION,objects:3,fields:58,associationIdsVerified:candidate.associations.every(a=>a.id!==null)};
}
export const nativePropertyInput=z.strictObject({locationId:z.literal(LOCATION),schemaKey:z.literal(NATIVE_SCHEMAS.property),recordId:id,properties:z.record(z.string(),z.string())});
export function decodeNativePropertyRecord(raw:unknown){
 auditNativeManifest();const x=nativePropertyInput.parse(raw);
 assert(Object.keys(x.properties).length===Object.keys(PROPERTY_FIELD_BINDINGS).length&&Object.keys(PROPERTY_FIELD_BINDINGS).every(k=>Object.hasOwn(x.properties,k)),'NATIVE_PROPERTY_FIELDS_INCOMPLETE');
 return property.parse({recordId:x.recordId,...Object.fromEntries(Object.entries(PROPERTY_FIELD_BINDINGS).map(([nativeKey,normalizedKey])=>[normalizedKey,x.properties[nativeKey]]))});
}
