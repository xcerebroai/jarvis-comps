import {db} from '../../../../lib/db';
import {headlessNativeQuoteHandler} from '../../../../lib/headless-native-quote';
import {nativeQuoteRuntimeFromEnvironment} from '../../../../lib/native-quote-runtime';

export const runtime='nodejs';
export const maxDuration=15;
export async function POST(request:Request){
 return headlessNativeQuoteHandler({query:async<T>(sql:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...params)},nativeQuoteRuntimeFromEnvironment(process.env),process.env.JARVIS_NATIVE_QUOTE_ENABLED==='true')(request);
}
