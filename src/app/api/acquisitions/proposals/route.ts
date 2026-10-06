import {headlessProposalHandler} from '../../../../lib/headless-proposals';
import {db} from '../../../../lib/db';
export const runtime='nodejs';
export const POST=headlessProposalHandler({query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},process.env.JARVIS_ACQUISITIONS_ENABLED==='true');
