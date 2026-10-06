import {headlessCompHandler} from '../../../../lib/headless-acquisitions';
import {db} from '../../../../lib/db';
import {resolveProperty,fetchComps} from '../../../../lib/dealmachine';
export const runtime='nodejs';
export const POST=headlessCompHandler({query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},{resolveProperty,fetchComps},process.env.JARVIS_ACQUISITIONS_ENABLED==='true');
