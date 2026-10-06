import {getSessionUser} from '../../../../lib/auth';
import {db} from '../../../../lib/db';
import {issueAnalysisCredential,credentialOriginAllowed} from '../../../../lib/acquisition-issuance';
export const runtime='nodejs';
export async function POST(request:Request){
 const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(process.env.JARVIS_ACQUISITIONS_ENABLED!=='true')return reply({error:'Acquisition setup is not enabled'},503);
 // Existing session cookies may be SameSite=None. Explicit Origin check prevents CSRF.
 if(!credentialOriginAllowed(request.headers.get('origin')))return reply({error:'Origin denied'},403);
 const user=await getSessionUser();if(!user?.isAdmin||user.entitlement!=='active')return reply({error:'Admin access required'},403);
 try{const body=await request.json();if(!body||Object.keys(body).some(k=>!['agency','expiresAt'].includes(k))||typeof body.agency!=='string'||typeof body.expiresAt!=='string')return reply({error:'Invalid request'},400);
  const result=await issueAnalysisCredential({query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},user.id,body.agency,body.expiresAt);
  return reply(result,201);
 }catch{return reply({error:'Credential not issued; verify approved tenant metadata and explicit expiry'},422);}
}
