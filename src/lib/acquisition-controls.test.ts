import {describe,it,expect} from 'vitest';
import {controlsHandler,packetDigest,withinStandingPolicy,validPacket} from './acquisition-controls';
import type {Packet,StandingPolicy} from './acquisition-controls';
import {credentialOriginAllowed} from './acquisition-issuance';
import type {BoundSql} from './acquisition-repository';
const packet:Packet={propertyId:'SYNTHETIC-property',recipientId:'SYNTHETIC-recipient',asset:'house',strategy:'wholesale',priceUsd:100000,terms:{closingDate:'2027-01-01',depositUsd:1000,inspectionDays:10,assignmentAllowed:true,financing:'cash',sellerConcessionsUsd:0},analysisId:'SYNTHETIC-analysis',analysisVersion:'SYNTHETIC-version'};
const policy:StandingPolicy={...packet,id:'SYNTHETIC-policy',version:'SYNTHETIC-policy-version',approvedBy:'SYNTHETIC-human',expiresAt:'2027-01-02T00:00:00Z',revoked:false,minPriceUsd:90000,maxPriceUsd:110000};
const expiry='2027-01-01T00:00:00Z';
function request(action:string,payload:unknown,agency='SYNTHETIC-agency',origin:string|null='https://comps.xcerebro.ai') {return new Request('https://comps.xcerebro.ai/api/acquisitions/review',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify({agency,action,payload})});}
function fixture(role='human_reviewer'){
 const statements:{sql:string;params:unknown[]}[]=[];
 let selected=true,held=false,current=true,policyPresent=true,write=true;
 const sql:BoundSql={query:async<T>(statement:string,params:unknown[])=>{statements.push({sql:statement,params});let rows:unknown[]=[];
  if(statement.startsWith('SELECT m.role'))rows=selected&&params[0]==='SYNTHETIC-agency'?[{role}]:[];
  else if(statement.startsWith('SELECT id,version,result'))rows=[{id:packet.analysisId,version:current?packet.analysisVersion:'old',result:{status:'INTERNAL_REVIEW',method:'house_verified_renovated_sales',propertyId:packet.propertyId}}];
  else if(statement.startsWith('SELECT reason'))rows=held?[{reason:'opt_out'}]:[];
  else if(statement.startsWith('SELECT s."offerPolicy"'))rows=policyPresent?[{offerPolicy:policy}]:[];
  else if(statement.startsWith('INSERT')||statement.startsWith('UPDATE'))rows=write?[{id:'SYNTHETIC-review',agency:'SYNTHETIC-agency'}]:[];
  return rows as T[];}};
 return {handler:controlsHandler(sql,async()=>({id:'SYNTHETIC-human',entitlement:'active'}),true),statements,set:(x:{selected?:boolean;held?:boolean;current?:boolean;policyPresent?:boolean;write?:boolean})=>{selected=x.selected??selected;held=x.held??held;current=x.current??current;policyPresent=x.policyPresent??policyPresent;write=x.write??write;}};
}
describe('strict origin configuration',()=>{
 it('allows only explicitly configured HTTPS origins',()=>{expect(credentialOriginAllowed('https://preview.example','https://preview.example')).toBe(true);for(const o of [null,'null','https://preview.example.evil','http://preview.example','https://preview.example/path'])expect(credentialOriginAllowed(o,'https://preview.example')).toBe(false);});
 it('fails closed on malformed configuration including wildcards',()=>{for(const list of ['https://*.example','https://preview.example/','http://preview.example','https://user:pass@example','https://preview.example,'])expect(credentialOriginAllowed('https://comps.xcerebro.ai',list)).toBe(false);});
});
describe('bounded exact packets',()=>{
 it('canonical digest is independent of client key order and changes with recipient, terms or version',()=>{const reordered={...packet,terms:{financing:'cash',assignmentAllowed:true,closingDate:'2027-01-01',inspectionDays:10,depositUsd:1000,sellerConcessionsUsd:0}};expect(packetDigest(reordered)).toBe(packetDigest(packet));for(const p of [{...packet,recipientId:'other'},{...packet,analysisVersion:'other'},{...packet,terms:{...packet.terms,depositUsd:2000}}])expect(packetDigest(p)).not.toBe(packetDigest(packet));});
 it('refuses missing or invented terms and nonfinite prices',()=>{expect(validPacket({...packet,priceUsd:NaN})).toBe(false);expect(validPacket({...packet,terms:{...packet.terms,extra:'invented'}})).toBe(false);expect(validPacket({...packet,terms:{closingDate:'2027-01-01'}})).toBe(false);});
 it('enforces bounds, all scope fields, expiry and revocation',()=>{const now=Date.parse('2026-10-06T00:00:00Z');expect(withinStandingPolicy(packet,policy,now)).toBe(true);for(const p of [{...packet,priceUsd:110001},{...packet,recipientId:'other'},{...packet,propertyId:'other'},{...packet,strategy:'creative'},{...packet,terms:{...packet.terms,assignmentAllowed:false}}])expect(withinStandingPolicy(p,policy,now)).toBe(false);expect(withinStandingPolicy(packet,{...policy,revoked:true},now)).toBe(false);expect(withinStandingPolicy(packet,policy,Date.parse(policy.expiresAt))).toBe(false);});
});
describe('authenticated review request integration',()=>{
 it('disabled route and CSRF reject before SQL',async()=>{const f=fixture();for(const origin of [null,'null','https://evil.example'])expect((await f.handler(request('approve',{packet,expiresAt:expiry},undefined,origin))).status).toBe(403);expect(f.statements).toHaveLength(0);const off=controlsHandler({query:async()=>{throw Error('must not query');}},async()=>null,false);expect((await off(request('approve',{}))).status).toBe(503);});
 it('rejects unselected/cross-tenant membership and machine roles',async()=>{const f=fixture();expect((await f.handler(request('approve',{packet,expiresAt:expiry},'other-tenant'))).status).toBe(403);f.set({selected:false});expect((await f.handler(request('approve',{packet,expiresAt:expiry}))).status).toBe(403);expect((await fixture('machine').handler(request('approve',{packet,expiresAt:expiry}))).status).toBe(403);});
 it('cannot self-grant via policy payload',async()=>{const f=fixture('owner_admin');expect((await f.handler(request('settings',{policy:{},selected:true,actor:'attacker'}))).status).toBe(400);expect(f.statements.filter(x=>/^(INSERT|UPDATE)/.test(x.sql))).toHaveLength(0);});
 it('holds and stale analyses fail before review creation',async()=>{for(const change of [{held:true},{current:false}]){const f=fixture();f.set(change);expect((await f.handler(request('approve',{packet,expiresAt:expiry}))).status).toBe(422);expect(f.statements.some(x=>x.sql.startsWith('INSERT'))).toBe(false);}});
 it('standing authorization pins policy identity atomically and returns no delivery',async()=>{const f=fixture();const response=await f.handler(request('authorize',{packet,expiresAt:expiry}));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({outboundEnabled:false,deliveryInstalled:false});const save=f.statements.find(x=>x.sql.startsWith('INSERT INTO "AcquisitionReview"'))!;expect(save.params.slice(-2)).toEqual([policy.id,policy.version]);expect(save.sql).toContain('ps."offerPolicy"->>\'revoked\'=\'false\'');expect(save.sql).toContain('newer."sequence">a."sequence"');});
 it('refuses relabeling a house analysis as land',async()=>{expect((await fixture().handler(request('approve',{packet:{...packet,asset:'land'},expiresAt:expiry}))).status).toBe(422);});
 it('changed terms, absent policy or concurrent authorization loss refuse approval',async()=>{const a=fixture();expect((await a.handler(request('authorize',{packet:{...packet,priceUsd:120000},expiresAt:expiry}))).status).toBe(422);const b=fixture();b.set({policyPresent:false});expect((await b.handler(request('authorize',{packet,expiresAt:expiry}))).status).toBe(422);const c=fixture();c.set({write:false});expect((await c.handler(request('approve',{packet,expiresAt:expiry}))).status).toBe(422);});
});
