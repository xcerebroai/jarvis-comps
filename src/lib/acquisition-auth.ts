import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {AcquisitionContext} from './acquisition-handler';
export type Credential={id:string;agency:string;location:string;actor:string;scopes:string[];expiresAt:string;revoked:boolean};
export type AuthRepository={byTokenHash(hash:string):Promise<Credential|null>;byKeyId(id:string):Promise<Credential|null>};
const allowed=(c:Credential|null,now:number):c is Credential=>Boolean(c&&!c.revoked&&Number.isFinite(Date.parse(c.expiresAt))&&Date.parse(c.expiresAt)>now&&c.agency&&c.location&&c.actor&&c.scopes.includes('acquisitions:analyze'));
export function scopedBearerAuth(repository:AuthRepository,clock=()=>Date.now()){
 return async(request:Request):Promise<AcquisitionContext|null>=>{
  const header=request.headers.get('authorization');
  if(!header?.startsWith('Bearer '))return null;
  const token=header.slice(7);if(token.length<32||token.length>512||/\s/.test(token))return null;
  const credential=await repository.byTokenHash(createHash('sha256').update(token).digest('hex'));
  if(!allowed(credential,clock()))return null;
  return{agency:credential.agency,location:credential.location,actor:credential.actor};
 };
}
/** Optional short-lived signed broker token. Native GHL signing compatibility is
 * not assumed. No key is generated, opened, printed or granted by this module. */
export function signedBrokerAuth(repository:AuthRepository,secretForKey:(id:string)=>Promise<string|null>,clock=()=>Date.now()){
 return async(request:Request):Promise<AcquisitionContext|null>=>{
  const header=request.headers.get('authorization');if(!header?.startsWith('Bearer '))return null;
  const parts=header.slice(7).split('.');if(parts.length!==3||parts.some(p=>p.length>4096))return null;
  try{
   const h=JSON.parse(Buffer.from(parts[0],'base64url').toString()),p=JSON.parse(Buffer.from(parts[1],'base64url').toString());
   if(h.alg!=='HS256'||h.typ!=='JWT'||typeof h.kid!=='string')return null;
   const c=await repository.byKeyId(h.kid);if(!allowed(c,clock()))return null;
   const secret=await secretForKey(h.kid);if(!secret||secret.length<32)return null;
   const expected=createHmac('sha256',secret).update(parts[0]+'.'+parts[1]).digest(),actual=Buffer.from(parts[2],'base64url');
   if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
   const now=Math.floor(clock()/1000);
   if(p.iss!=='jarvis-acquisition-broker'||p.aud!=='jarvis-acquisition-analysis'||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now||p.exp<=now||p.exp-p.iat>300||typeof p.jti!=='string'||!p.jti||p.sub!==c.actor||p.agency!==c.agency||p.location!==c.location)return null;
   return{agency:c.agency,location:c.location,actor:c.actor};
  }catch{return null;}
 };
}
