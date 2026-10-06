import {acquisitionHandler} from '../../../../lib/acquisition-handler';
import {composeAcquisitionRuntime} from '../../../../lib/acquisition-runtime';
import {db} from '../../../../lib/db';
import {resolveProperty,fetchComps} from '../../../../lib/dealmachine';
export const runtime='nodejs';
// Existing protected DATABASE_URL / DEALMACHINE_API_KEY stay on this host.
// Opt-in flag, reviewed migration and owner secure credential entry required.
export const POST=acquisitionHandler(process.env.JARVIS_ACQUISITIONS_ENABLED==='true'
 ? composeAcquisitionRuntime({query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},{resolveProperty,fetchComps})
 : null);
