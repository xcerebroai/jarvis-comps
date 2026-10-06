import{test}from'node:test';import assert from'node:assert/strict';import{createHash,createHmac}from'node:crypto';
import{scopedBearerAuth,signedBrokerAuth}from './acquisition-auth';import type{Credential}from './acquisition-auth';
const token='SYNTHETIC-TEST-ONLY-NOT-A-REAL-SERVICE-CREDENTIAL';
const clock=()=>Date.parse('2026-10-06T00:00:00Z');
const credential:Credential={id:'SYNTHETIC-key',agency:'SYNTHETIC-agency',location:'SYNTHETIC-location',actor:'SYNTHETIC-service',scopes:['acquisitions:analyze'],expiresAt:'2027-01-01T00:00:00Z',revoked:false};
const repo={byTokenHash:async(hash:string)=>hash===createHash('sha256').update(token).digest('hex')?credential:null,byKeyId:async(id:string)=>id===credential.id?credential:null};
const request=(key:string)=>new Request('https://example.invalid',{headers:{authorization:'Bearer '+key,'x-location-id':'ATTACKER'}});
test('bearer binds server tenant, rejects wrong key and expiry/revocation/scope',async()=>{
 const auth=scopedBearerAuth(repo,clock);assert.equal((await auth(request(token)))?.location,'SYNTHETIC-location');assert.equal(await auth(request('SYNTHETIC-wrong-key-xxxxxxxxxxxxxxxxxx')),null);
 for(const change of [{revoked:true},{expiresAt:'2020-01-01Z'},{scopes:['contacts:write']}]){const bad={...repo,byTokenHash:async()=>({...credential,...change})};assert.equal(await scopedBearerAuth(bad,clock)(request(token)),null);}
});
function jwt(changes:Record<string,unknown>={},algorithm='HS256'){
 const h=Buffer.from(JSON.stringify({alg:algorithm,typ:'JWT',kid:credential.id})).toString('base64url');
 const p=Buffer.from(JSON.stringify({iss:'jarvis-acquisition-broker',aud:'jarvis-acquisition-analysis',sub:credential.actor,agency:credential.agency,location:credential.location,jti:'SYNTHETIC-request',iat:Math.floor(clock()/1000),exp:Math.floor(clock()/1000)+120,...changes})).toString('base64url');
 return h+'.'+p+'.'+createHmac('sha256',token).update(h+'.'+p).digest('base64url');
}
test('signed broker accepts only exact server scope and short-lived signature',async()=>{
 const auth=signedBrokerAuth(repo,async()=>token,clock);assert.equal((await auth(request(jwt())))?.actor,credential.actor);
 for(const change of [{location:'other'},{aud:'other'},{exp:Math.floor(clock()/1000)+600},{exp:Math.floor(clock()/1000)-1},{iat:Math.floor(clock()/1000)+1}])assert.equal(await auth(request(jwt(change))),null);
 assert.equal(await auth(request(jwt({},'none'))),null);const valid=jwt();assert.equal(await auth(request(valid.slice(0,-5)+'xxxxx')),null);
});
