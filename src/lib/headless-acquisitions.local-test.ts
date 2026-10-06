/** SYNTHETIC ONLY: fixed local Unix socket, never reads hosted connection secrets. */
import {PrismaClient} from '@prisma/client';
import {userInfo} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {headlessProposalHandler} from './headless-proposals';
import {headlessCompHandler} from './headless-acquisitions';
import type {HousePolicy,Provider} from './headless-acquisitions';
import type {DmCompsResult} from './dealmachine';
async function main(){
 const db=new PrismaClient({datasourceUrl:`postgresql://${encodeURIComponent(userInfo().username)}@localhost:55439/neondb?host=/tmp/jarvis-acq-test-pg-socket`});
 const agency='SYNTHETIC-headless-agency',location='SesCoVXlNu7qTSBol1gs',actor='SYNTHETIC-headless-machine';
 const token='SYNTHETIC-LOCAL-ONLY-NOT-A-REAL-MACHINE-CREDENTIAL';
 const policy:HousePolicy={approvalReference:'SYNTHETIC-headless-policy',expiresAt:'2027-01-01T00:00:00Z',housePropertyTypes:['SYNTHETIC-house'],saleTypes:['SYNTHETIC-recorded'],radiusMiles:1,maxAgeDays:365,sizeTolerance:.2,minComps:3,maxSourceAgeHours:24};
 try{
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionMembership"(agency,location,actor,role,enabled) VALUES($1,$2,$3,\'analysis_machine\',TRUE) ON CONFLICT(agency,location,actor) DO UPDATE SET enabled=TRUE',agency,location,actor);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionSettings"(agency,location,selected,"selectedBy","decisionReference",policy) VALUES($1,$2,TRUE,\'SYNTHETIC-owner\',\'SYNTHETIC-decision\',$3::jsonb) ON CONFLICT(agency,location) DO UPDATE SET selected=TRUE,policy=EXCLUDED.policy',agency,location,JSON.stringify(policy));
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionCredential"(id,"tokenHash",agency,location,actor,scopes,"expiresAt") VALUES(\'SYNTHETIC-headless-key\',$1,$2,$3,$4,ARRAY[\'acquisitions:analyze\'],\'2027-01-01T00:00:00Z\') ON CONFLICT(id) DO UPDATE SET revoked=FALSE,agency=EXCLUDED.agency,location=EXCLUDED.location,actor=EXCLUDED.actor',createHash('sha256').update(token).digest('hex'),agency,location,actor);
  await db.$executeRawUnsafe('DELETE FROM "AcquisitionAnalysis" WHERE agency=$1 AND location=$2',agency,location);
  await db.$executeRawUnsafe('DELETE FROM "AcquisitionHold" WHERE agency=$1 AND location=$2',agency,location);
  let calls=0;
  const provider:Provider={resolveProperty:async()=>{calls++;return {match:{input:{},matched:true,dm_property_id:'SYNTHETIC-headless-property'},matchedAddress:'SYNTHETIC property',normalized:false};},fetchComps:async()=>{calls++;return {found:true,subject:{dm_property_id:'SYNTHETIC-headless-property',sqft:1000,property_type:'SYNTHETIC-house'},comps:[100000,120000,140000].map((price,i)=>({dm_property_id:'SYNTHETIC-comp-'+i,address:'SYNTHETIC comp',type:'sale',sale_type:'SYNTHETIC-recorded',sale_price:price,sale_date:'2026-06-01',sqft:1000,distance:.2,property_type:'SYNTHETIC-house'}))} as unknown as DmCompsResult;}};
  const handler=headlessCompHandler({query:async<T>(sql:string,parameters:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...parameters)},provider,true,()=>new Date('2026-10-06T12:00:00Z'));
  const request=(address='SYNTHETIC property')=>new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({address,requestId:'synthetic-headless-1'})});
  const first=await handler(request());assert.equal(first.status,200);const one=await first.json();assert.equal(one.valuation.valueUsd,120000);assert.equal(one.offerReadiness,'NEEDS_INPUT');
  const two=await (await handler(request())).json();assert.equal(one.analysisId,two.analysisId);assert.equal(calls,2);
  assert.equal((await handler(request('SYNTHETIC different property'))).status,422);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionHold"(agency,location,"propertyId",reason) VALUES($1,$2,\'SYNTHETIC-headless-property\',\'opt_out\')',agency,location);
  assert.equal((await handler(request())).status,409);assert.equal(calls,2);
  await db.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET selected=FALSE WHERE agency=$1 AND location=$2',agency,location);assert.equal((await handler(request())).status,401);
  await db.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET selected=TRUE WHERE agency=$1 AND location=$2',agency,location);
  await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET revoked=TRUE WHERE id=\'SYNTHETIC-headless-key\'');assert.equal((await handler(request())).status,401);
  await db.$executeRawUnsafe('DELETE FROM "AcquisitionHold" WHERE agency=$1 AND location=$2',agency,location);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionMembership"(agency,location,actor,role,enabled) VALUES($1,$2,\'SYNTHETIC-headless-owner\',\'client_owner\',TRUE) ON CONFLICT(agency,location,actor) DO UPDATE SET enabled=TRUE',agency,location);
  const complete:HousePolicy={...policy,offer:{approvalReference:'SYNTHETIC-offer-policy',basis:'comparable_market_value',valueMultiplier:.8,costs:{'SYNTHETIC-headless-property':{reference:'SYNTHETIC-costs',repairsUsd:10000,closingCostsUsd:3000,targetProfitUsd:10000,assignmentFeeUsd:5000}}},standingPolicy:{id:'SYNTHETIC-standing',version:'SYNTHETIC-policy-v1',approvedBy:'SYNTHETIC-headless-owner',expiresAt:'2026-12-31T00:00:00Z',revoked:false,propertyId:'SYNTHETIC-headless-property',recipientId:'SYNTHETIC-recipient',asset:'house',strategy:'wholesale',minPriceUsd:60000,maxPriceUsd:70000,terms:{closingDate:'2026-12-01',depositUsd:1000,inspectionDays:10,assignmentAllowed:true,financing:'SYNTHETIC cash',sellerConcessionsUsd:0}}};
  await db.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET policy=$3::jsonb WHERE agency=$1 AND location=$2',agency,location,JSON.stringify(complete));
  await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET revoked=FALSE,scopes=ARRAY[\'acquisitions:analyze\',\'acquisitions:propose\'] WHERE id=\'SYNTHETIC-headless-key\'');
  await db.$executeRawUnsafe('DELETE FROM "AcquisitionReview" WHERE agency=$1 AND location=$2',agency,location);
  const fresh=await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({address:'SYNTHETIC property',contactId:'SYNTHETIC-contact'})}));assert.equal(fresh.status,200);const analysis=await fresh.json();assert.equal(analysis.offerReadiness,'LIMIT_READY');assert.ok(!JSON.stringify(analysis).includes('maxPriceUsd'));
  const proposals=headlessProposalHandler({query:async<T>(sql:string,parameters:unknown[])=>db.$queryRawUnsafe<T[]>(sql,...parameters)},true,()=>new Date('2026-10-06T12:00:00Z'));
  const proposal=(priceUsd=65000)=>new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({analysisId:analysis.analysisId,analysisVersion:analysis.analysisVersion,priceUsd})});
  const authorized=await proposals(proposal());assert.equal(authorized.status,200);const authorization=await authorized.json();assert.equal(authorization.deliveryInstalled,false);assert.equal((await (await proposals(proposal())).json()).authorizationId,authorization.authorizationId);
  assert.equal((await proposals(proposal(69000))).status,422);
  await db.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET enabled=FALSE WHERE agency=$1 AND location=$2 AND actor=\'SYNTHETIC-headless-owner\'',agency,location);assert.equal((await proposals(proposal())).status,422);
  await db.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET enabled=TRUE WHERE agency=$1 AND location=$2 AND actor=\'SYNTHETIC-headless-owner\'',agency,location);
  await db.$executeRawUnsafe('UPDATE "AcquisitionReview" SET "usedAt"=CURRENT_TIMESTAMP WHERE id=$1',authorization.authorizationId);assert.equal((await proposals(proposal())).status,422);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionHold"(agency,location,"propertyId",reason) VALUES($1,$2,\'SYNTHETIC-headless-property\',\'human_takeover\')',agency,location);assert.equal((await proposals(proposal(66000))).status,422);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionMembership"(agency,location,actor,role,enabled) VALUES(\'SYNTHETIC-other-agency\',\'SesCoVXlNu7qTSBol1gs\',$1,\'analysis_machine\',TRUE) ON CONFLICT(agency,location,actor) DO UPDATE SET enabled=TRUE',actor);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionSettings"(agency,location,selected,"selectedBy","decisionReference",policy) VALUES(\'SYNTHETIC-other-agency\',\'SesCoVXlNu7qTSBol1gs\',TRUE,\'SYNTHETIC-other-owner\',\'SYNTHETIC-other-decision\',$1::jsonb) ON CONFLICT(agency,location) DO UPDATE SET selected=TRUE,policy=EXCLUDED.policy',JSON.stringify(complete));
  await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET agency=\'SYNTHETIC-other-agency\',location=\'SesCoVXlNu7qTSBol1gs\' WHERE id=\'SYNTHETIC-headless-key\'');
  const cross=await proposals(proposal());assert.equal(cross.status,422);assert.ok(!JSON.stringify(await cross.json()).includes('65000'));
  console.log('PASS synthetic-only actual Postgres machine auth, comp success, canonical replay, conflict, STOP hold, deselection and revocation; cross-tenant proposal refusal, standing-policy packet readiness/replay/ceiling, disabled GHL approver, consumed approval and takeover; no real provider or outbound action.');
 }finally{await db.$disconnect();}
}
void main().catch(()=>{console.error('Synthetic local test failed; inspect locally without printing connection exceptions.');process.exitCode=1;});
