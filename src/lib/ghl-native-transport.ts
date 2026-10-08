import {z} from 'zod';
import {LOCATION} from './native/contracts';
import {INSTALLED} from './native-installed-fields';
import type {AuthorizedGhlTransport,GhlQuoteBindings,GhlRequest} from './ghl-native-quote';

export const GHL_API_ORIGIN='https://services.leadconnectorhq.com';
export const GHL_RESPONSE_LIMIT_BYTES=1_048_576;
const tokenSchema=z.string().min(20).max(4096).regex(/^[\x21-\x7e]+$/);
const recordId=/^[A-Za-z0-9_-]+$/;
const fail=()=>{throw Error('NATIVE_TRANSPORT_UNAVAILABLE');};

/** Server-only fixed-origin transport. No redirects, retries, token logging or provider calls.
 * The existing private-integration token is entered in the host's secure server binding.
 * Nothing reads an env file or creates/rotates a credential. */
export function createGhlNativeTransport(token:string,bindings:GhlQuoteBindings,fetcher:typeof fetch=fetch):AuthorizedGhlTransport{
 if(!tokenSchema.safeParse(token).success||bindings.apiVersion!=='v3')fail();
 const schemas=new Set(['custom_objects.jarvis_acq_properties','custom_objects.jarvis_acq_analyses','custom_objects.jarvis_acq_analysis_evidence_rows',bindings.context.schemaKey,bindings.policy.schemaKey,bindings.offer.schemaKey,bindings.quote.schemaKey,INSTALLED.ceiling]);
 function target(request:GhlRequest){
  if(request.version!==bindings.apiVersion||!['GET','POST'].includes(request.method))fail();
  const parts=request.path.split('/');
  const object=parts.length===5&&parts[1]==='objects'&&schemas.has(parts[2])&&parts[3]==='records'&&recordId.test(parts[4]);
  const create=parts.length===4&&parts[1]==='objects'&&parts[2]===bindings.quote.schemaKey&&parts[3]==='records';
  const contact=parts.length===3&&parts[1]==='contacts'&&recordId.test(parts[2]);
  const relation=parts.length===4&&parts[1]==='associations'&&parts[2]==='relations'&&recordId.test(parts[3]);
  if(parts[0]!==''||!(request.method==='GET'&&(object&&parts[4]!=='search'||contact||relation)||request.method==='POST'&&(object&&parts[4]==='search'||create)))fail();
  const url=new URL(request.path,GHL_API_ORIGIN);
  if(url.origin!==GHL_API_ORIGIN||url.pathname!==request.path)fail();
  if(relation){
   const q=z.strictObject({locationId:z.literal(LOCATION),skip:z.number().int().min(0).max(1500),limit:z.literal(100),associationIds:z.array(z.string()).length(1)}).parse(request.query);
   if(![bindings.relations.sellerPropertyAssociationId,bindings.relations.analysisPropertyAssociationId,bindings.relations.evidenceAnalysisAssociationId].includes(q.associationIds[0]))fail();
   url.searchParams.set('locationId',q.locationId);url.searchParams.set('skip',String(q.skip));url.searchParams.set('limit',String(q.limit));
   for(const id of q.associationIds)url.searchParams.append('associationIds',id);
  }else if(request.query!==undefined)fail();
  if(request.method==='GET'&&request.body!==undefined)fail();
  if(request.method==='POST'&&(request.body===null||typeof request.body!=='object'||(request.body as {locationId?:unknown}).locationId!==LOCATION))fail();
  return url;
 }
 return async request=>{
  try{
   request.signal.throwIfAborted();
   const url=target(request),body=request.body===undefined?undefined:JSON.stringify(request.body);
   if(body&&Buffer.byteLength(body)>GHL_RESPONSE_LIMIT_BYTES)fail();
   const response=await fetcher(url,{method:request.method,headers:{Authorization:`Bearer ${token}`,Version:bindings.apiVersion,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body,signal:request.signal,cache:'no-store',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer'});
   request.signal.throwIfAborted();
   // Error/redirect payloads can contain private details. Never parse, log or return them.
   if(!response.ok){await response.body?.cancel();return {status:response.status,body:null};}
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();return fail();}
   const length=response.headers.get('content-length');
   if(length!==null&&(!/^\d+$/.test(length)||Number(length)>GHL_RESPONSE_LIMIT_BYTES)){await response.body?.cancel();return fail();}
   const reader=response.body?.getReader();if(!reader)return fail();
   const chunks:Uint8Array[]=[];let bytes=0;
   const cancel=()=>{void reader.cancel().catch(()=>undefined);};request.signal.addEventListener('abort',cancel,{once:true});
   try{while(true){request.signal.throwIfAborted();const {done,value}=await reader.read();request.signal.throwIfAborted();if(done)break;bytes+=value.byteLength;if(bytes>GHL_RESPONSE_LIMIT_BYTES){await reader.cancel();return fail();}chunks.push(value);}}
   finally{request.signal.removeEventListener('abort',cancel);reader.releaseLock();}
   return {status:response.status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)))};
  }catch{return fail();}
 };
}
