import {previewIdentityHandler} from '../../../../lib/acquisition-preview-identity';
import {getSessionUser} from '../../../../lib/auth';
import {db} from '../../../../lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=previewIdentityHandler(process.env.VERCEL_ENV,getSessionUser,{query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)});
