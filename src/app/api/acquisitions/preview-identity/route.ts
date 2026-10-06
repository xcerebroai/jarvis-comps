import {previewIdentityHandler,safeDatabaseConfiguration} from '../../../../lib/acquisition-preview-identity';
import {db} from '../../../../lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=previewIdentityHandler(process.env.VERCEL_ENV,{query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},()=>safeDatabaseConfiguration(process.env.DATABASE_URL));
