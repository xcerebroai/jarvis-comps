import type {BoundSql} from './acquisition-repository';
export type DatabaseIdentity={database:string;projectId:string|null;branchId:string|null;endpointId:string|null};
export const expectedPreviewIdentity:DatabaseIdentity={database:'neondb',projectId:'tiny-recipe-78351340',branchId:'br-purple-cherry-aws7cy1w',endpointId:'ep-falling-leaf-aw5i8ldf'};
export function safeDatabaseConfiguration(value:string|undefined){
 const present=typeof value==='string'&&value.length>0;
 const whitespace=present&&/[\r\n]|^\s|\s$/.test(value);
 const quoted=present&&/^['"]|['"]$/.test(value);
 try{const u=new URL(value??'');const protocolAccepted=['postgresql:','postgres:'].includes(u.protocol),hostPresent=Boolean(u.hostname),databasePresent=u.pathname.length>1;
  return {present,protocolAccepted,hostPresent,databasePresent,whitespace,quoted,formatValid:present&&protocolAccepted&&hostPresent&&databasePresent&&!whitespace&&!quoted};
 }catch{return {present,protocolAccepted:false,hostPresent:false,databasePresent:false,whitespace,quoted,formatValid:false};}
}
export function safeIdentityFailure(error:unknown,stage:'connection'|'provider-settings'){
 const e=error&&typeof error==='object'?error as {code?:unknown;errorCode?:unknown;name?:unknown;meta?:{code?:unknown}}:{};
 const candidate=e.code??e.errorCode;
 const code=typeof candidate==='string'&&['P1000','P1001','P1002','P1003','P1008','P1010','P1011','P1013','P1017','P2010'].includes(candidate)?candidate:'UNKNOWN';
 const errorClass=typeof e.name==='string'&&['PrismaClientInitializationError','PrismaClientKnownRequestError','PrismaClientUnknownRequestError','PrismaClientValidationError','PrismaClientRustPanicError','Error','TypeError'].includes(e.name)?e.name:'UNKNOWN';
 const state=typeof e.meta?.code==='string'&&['08001','08003','08006','28000','28P01','3D000','42501','42704','42883','53300','57P01'].includes(e.meta.code)?e.meta.code:null;
 return {stage,code,sqlState:state,errorClass};
}
/** Read-only Preview diagnostic behind independently verified Vercel Authentication.
 * No caller/header authentication is invented here. Never enable an unprotected preview.
 * Exact nonsecret approved target; missing settings fail verification. */
export function previewIdentityHandler(environment:string|undefined,sql:BoundSql,configuration?:()=>ReturnType<typeof safeDatabaseConfiguration>){
 return async()=>{
  const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
  if(environment!=='preview')return reply({error:'Not found'},404);
  let stage:'connection'|'provider-settings'='connection';
  try{
   const databases=await sql.query<{database:string}>(`SELECT current_database()::text AS database`,[]);
   if(!databases[0])return reply({error:'Identity unavailable; migration blocked',migrationBlocked:true,diagnostic:{stage,code:'EMPTY_RESULT',sqlState:null}},503);
   stage='provider-settings';
   const rows=await sql.query<Omit<DatabaseIdentity,'database'>>(`SELECT current_setting('neon.project_id',true)::text AS "projectId",current_setting('neon.branch_id',true)::text AS "branchId",current_setting('neon.endpoint_id',true)::text AS "endpointId"`,[]);
   const row=rows[0];if(!row)return reply({error:'Identity unavailable; migration blocked',migrationBlocked:true,diagnostic:{stage,code:'EMPTY_RESULT',sqlState:null}},503);
   // Explicit allowlist: never return arbitrary adapter fields or connection data.
   const identity:DatabaseIdentity={database:databases[0].database,projectId:row.projectId,branchId:row.branchId,endpointId:row.endpointId};
   const matches=Object.keys(expectedPreviewIdentity).every(k=>identity[k as keyof DatabaseIdentity]===expectedPreviewIdentity[k as keyof DatabaseIdentity]);
   return reply({identity,matches,migrationBlocked:!matches},matches?200:409);
  }catch(error){return reply({error:'Identity unavailable; migration blocked',migrationBlocked:true,diagnostic:{...safeIdentityFailure(error,stage),...(configuration?{configuration:configuration()}: {})}},503);}
 };
}
