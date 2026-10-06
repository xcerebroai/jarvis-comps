/** Narrow HTTP contract with injectable trusted adapters. No session-cookie reuse. */
import {AcquisitionReviewRequired} from './acquisition-analysis';
import type {AcquisitionPolicy} from './acquisition-analysis';
import {reviewGuidance} from './acquisition-review-guidance';
import {analyzeBundle} from './acquisition-bundle';
import type {AcquisitionBundle} from './acquisition-bundle';
export type AcquisitionContext={agency:string;location:string;actor:string};
export interface AcquisitionRuntime {
  lookup(context:AcquisitionContext,requestId:string):Promise<{id:string;version:string;requestDigest:string;result:unknown}|null>;
  authenticate(request:Request):Promise<AcquisitionContext|null>;
  settings(context:AcquisitionContext):Promise<{selected:boolean;policy:AcquisitionPolicy|null}|null>;
  // Adapter must retain server provenance and verified condition/sale evidence.
  // Original raw DM saleType/AVM alone cannot supply these verification flags.
  comps(context:AcquisitionContext,address:string):Promise<AcquisitionBundle>;
  // Persist immutable tenant-scoped analysis; enforce request idempotency atomically.
  persist(context:AcquisitionContext,requestId:string,requestDigest:string,result:unknown):Promise<{id:string;version:string;result:unknown}>;
}
export function acquisitionHandler(runtime:AcquisitionRuntime|null) {
  return async (request:Request):Promise<Response>=>{
    const response=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
    if(!runtime)return response({status:'NEEDS_REVIEW',missing:['Approved acquisition authentication and persistence connection']},503);
    let context:AcquisitionContext|null;
    try{context=await runtime.authenticate(request);}catch{return response({status:'NEEDS_REVIEW',missing:['Authentication storage unavailable']},503);}
    if(!context?.agency || !context.location || !context.actor)return response({error:'Unauthorized'},401);
    let settings:Awaited<ReturnType<AcquisitionRuntime['settings']>>;
    try{settings=await runtime.settings(context);}catch{return response({status:'NEEDS_REVIEW',missing:['Approved tenant settings unavailable']},422);}
    if(!settings?.selected)return response({error:'Access unavailable'},403);
    let body:unknown;
    try{body=await request.json();}catch{return response({error:'Invalid request'},400);}
    if(!body || typeof body!=='object' || Array.isArray(body))return response({error:'Invalid request'},400);
    const value=body as Record<string,unknown>;
    if(Object.keys(value).some(k=>!['address','requestId'].includes(k)) ||
      typeof value.address!=='string' || value.address.trim().length<5 || value.address.length>200 ||
      typeof value.requestId!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.requestId))return response({error:'Invalid request'},400);
    try{
      const address=value.address.trim();
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({address})));
      const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      const existing=await runtime.lookup(context,value.requestId);
      if(existing&&existing.requestDigest!==digest)throw new AcquisitionReviewRequired('Idempotency conflict');
      let result:unknown;
      if(!existing){
       try{const bundle=await runtime.comps(context,address);if(!settings.policy)throw new AcquisitionReviewRequired('Approved tenant comp policy missing');result={...analyzeBundle(bundle,settings.policy,new Date(),false),evidenceReview:bundle.evidenceReview??null};}
       catch(error){if(!(error instanceof AcquisitionReviewRequired))throw error;result={status:'NEEDS_REVIEW',missing:[error.message],...reviewGuidance([error.message]),research:error.details??null};}
      }
      const saved=existing??await runtime.persist(context,value.requestId,digest,result);
      if(!saved.id || !saved.version)throw new AcquisitionReviewRequired('Immutable analysis persistence missing');
      if(!saved.result || typeof saved.result!=='object' || Array.isArray(saved.result))throw new AcquisitionReviewRequired('Canonical analysis missing');
      return response({...saved.result,analysisId:saved.id,analysisVersion:saved.version},(saved.result as {status?:string}).status==='NEEDS_REVIEW'?422:200);
    }catch(error){
      if(error instanceof AcquisitionReviewRequired)return response({status:'NEEDS_REVIEW',missing:[error.message],...reviewGuidance([error.message])},422);
      // Do not leak provider credentials, request bodies or another tenant's records.
      return response({status:'NEEDS_REVIEW',missing:['Analysis provider or persistence unavailable'],outboundEnabled:false},502);
    }
  };
}
