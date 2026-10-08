import {createGhlNativeQuoteRuntime,ghlQuoteBindings} from './ghl-native-quote';
import {createGhlNativeTransport} from './ghl-native-transport';
import type {NativeQuoteRuntime} from './native-quote-contract';

export const NATIVE_QUOTE_ENV_NAMES={enabled:'JARVIS_NATIVE_QUOTE_ENABLED',bindings:'JARVIS_NATIVE_QUOTE_BINDINGS_JSON',token:'JARVIS_GHL_PRIVATE_INTEGRATION_TOKEN'} as const;
/** Called only by the Node route. No build-time network or secret access, no env-file loader.
 * Missing/malformed/unverified configuration stays unavailable. This factory checks shape;
 * browser/admin verification references must substantiate the supplied native bindings. */
export function nativeQuoteRuntimeFromEnvironment(env:Readonly<Record<string,string|undefined>>,fetcher:typeof fetch=fetch):NativeQuoteRuntime|null{
 if(env.JARVIS_NATIVE_QUOTE_ENABLED!=='true')return null;
 try{
  const raw=env.JARVIS_NATIVE_QUOTE_BINDINGS_JSON;
  if(!raw||Buffer.byteLength(raw)>16384)return null;
  const bindings=ghlQuoteBindings.parse(JSON.parse(raw));
  if(bindings.storageMode!=='installed_fields'||bindings.apiVersion!=='v3')return null;
  const token=env.JARVIS_GHL_PRIVATE_INTEGRATION_TOKEN;
  if(!token)return null;
  return createGhlNativeQuoteRuntime(createGhlNativeTransport(token,bindings,fetcher),bindings);
 }catch{return null;}
}
