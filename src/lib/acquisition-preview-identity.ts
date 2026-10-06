import type {BoundSql} from './acquisition-repository';
export type DatabaseIdentity={database:string;projectId:string|null;branchId:string|null;endpointId:string|null};
export const expectedPreviewIdentity:DatabaseIdentity={database:'neondb',projectId:'tiny-recipe-78351340',branchId:'br-purple-cherry-aws7cy1w',endpointId:'ep-falling-leaf-aw5i8ldf'};
/** Read-only Preview diagnostic behind independently verified Vercel Authentication.
 * No caller/header authentication is invented here. Never enable an unprotected preview.
 * Exact nonsecret approved target; missing settings fail verification. */
export function previewIdentityHandler(environment:string|undefined,sql:BoundSql){
 return async()=>{
  const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
  if(environment!=='preview')return reply({error:'Not found'},404);
  try{
   const rows=await sql.query<DatabaseIdentity>(`SELECT current_database() AS database,current_setting('neon.project_id',true) AS "projectId",current_setting('neon.branch_id',true) AS "branchId",current_setting('neon.endpoint_id',true) AS "endpointId"`,[]);
   const row=rows[0];if(!row)return reply({error:'Identity unavailable; migration blocked'},503);
   // Explicit allowlist: never return arbitrary adapter fields or connection data.
   const identity:DatabaseIdentity={database:row.database,projectId:row.projectId,branchId:row.branchId,endpointId:row.endpointId};
   const matches=Object.keys(expectedPreviewIdentity).every(k=>identity[k as keyof DatabaseIdentity]===expectedPreviewIdentity[k as keyof DatabaseIdentity]);
   return reply({identity,matches,migrationBlocked:!matches},matches?200:409);
  }catch{return reply({error:'Identity unavailable; migration blocked'},503);}
 };
}
