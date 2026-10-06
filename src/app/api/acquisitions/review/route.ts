import {controlsHandler} from '../../../../lib/acquisition-controls';
import {getSessionUser} from '../../../../lib/auth';
import {db} from '../../../../lib/db';
export const runtime='nodejs';
export const POST=controlsHandler({query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},getSessionUser,process.env.JARVIS_ACQUISITIONS_ENABLED==='true');
