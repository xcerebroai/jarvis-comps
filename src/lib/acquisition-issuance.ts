import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {BoundSql} from './acquisition-repository';
export function credentialOriginAllowed(origin:string|null,configured=process.env.JARVIS_ACQUISITIONS_TRUSTED_ORIGINS??''){
 if(!origin)return false;
 const exact=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password&&!u.hostname.includes('*');}catch{return false;}};
 const additional=configured?configured.split(',').map(x=>x.trim()):[];
 // Invalid configuration fails closed rather than accepting a partial list.
 if(additional.some(x=>!exact(x))||!exact(origin))return false;
 return ['https://comps.xcerebro.ai',...additional].includes(origin);
}
export const JARVIS_PREMIUM_LOCATION='SesCoVXlNu7qTSBol1gs';
/** Called only by an authenticated active admin via the same-origin setup UI. */
export async function issueAnalysisCredential(sql:BoundSql,adminId:string,agency:string,expiresAt:string,now=Date.now()){
 const expires=Date.parse(expiresAt);
 if(!adminId||!/^[-A-Za-z0-9_]{5,100}$/.test(agency)||!Number.isFinite(expires)||expires<=now||expires-now>90*86400000)throw new Error('Valid agency and explicit expiry within 90 days required');
 const id=randomUUID(),token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
 const actor='machine:jarvis-premium-analysis';
 const rows=await sql.query<{id:string}>(`INSERT INTO "AcquisitionCredential" (id,"tokenHash",agency,location,actor,scopes,"expiresAt") SELECT $1,$2,$3,$4,$5,ARRAY['acquisitions:analyze'],$6::timestamptz FROM "AcquisitionSettings" s JOIN "AcquisitionMembership" owner ON owner.agency=s.agency AND owner.location=s.location JOIN "AcquisitionMembership" machine ON machine.agency=s.agency AND machine.location=s.location WHERE s.agency=$3 AND s.location=$4 AND s.selected=TRUE AND owner.actor=$7 AND owner.role='owner_admin' AND owner.enabled=TRUE AND machine.actor=$5 AND machine.enabled=TRUE RETURNING id`,[id,hash,agency,JARVIS_PREMIUM_LOCATION,actor,expiresAt,adminId]);
 if(!rows[0])throw new Error('Approved owner-selected Jarvis Premium membership required');
 return {id:rows[0].id,token,location:JARVIS_PREMIUM_LOCATION,scope:'acquisitions:analyze',expiresAt};
}
