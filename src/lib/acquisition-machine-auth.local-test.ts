/** Actual PostgreSQL syntax/scope checks in disposable synthetic Unix-socket database only. */
import {PrismaClient} from '@prisma/client';
import {userInfo} from 'node:os';
import assert from 'node:assert/strict';
import {authenticateMachine,machineTokenHash} from './acquisition-machine-auth';
import {LOCATION} from './native/contracts';
async function main(){
 const db=new PrismaClient({datasourceUrl:`postgresql://${encodeURIComponent(userInfo().username)}@localhost:55439/neondb?host=/tmp/jarvis-acq-test-pg-socket`});
 const agency='TEST_ONLY-quote-agency',actor='TEST_ONLY-quote-machine',key='TEST_ONLY-quote-credential';
 const hash=machineTokenHash(new Request('https://example.invalid',{headers:{authorization:'Bearer TEST_ONLY-local-synthetic-token-not-a-credential'}}))!;
 const sql={query:async<T>(statement:string,params:unknown[])=>db.$queryRawUnsafe<T[]>(statement,...params)};
 const check=()=>authenticateMachine(sql,hash,['acquisitions:analyze','acquisitions:propose']);
 try{
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionMembership"(agency,location,actor,role,enabled) VALUES($1,$2,$3,\'analysis_machine\',TRUE)',agency,LOCATION,actor);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionSettings"(agency,location,selected,"selectedBy","decisionReference",policy) VALUES($1,$2,TRUE,\'TEST_ONLY-owner\',\'TEST_ONLY-decision\',\'{}\')',agency,LOCATION);
  await db.$executeRawUnsafe('INSERT INTO "AcquisitionCredential"(id,"tokenHash",agency,location,actor,scopes,"expiresAt") VALUES($1,$2,$3,$4,$5,ARRAY[\'acquisitions:analyze\',\'acquisitions:propose\'],CURRENT_TIMESTAMP+INTERVAL \'1 hour\')',key,hash,agency,LOCATION,actor);
  assert.deepEqual(await check(),{agency,location:LOCATION,actor,policy:{}});
  for(const scope of ['acquisitions:analyze','acquisitions:propose']){await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET scopes=ARRAY[$2::text] WHERE id=$1',key,scope);assert.equal(await check(),null);}
  await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET scopes=ARRAY[\'acquisitions:analyze\',\'acquisitions:propose\'],revoked=TRUE WHERE id=$1',key);assert.equal(await check(),null);
  await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET revoked=FALSE,"expiresAt"=CURRENT_TIMESTAMP-INTERVAL \'1 second\' WHERE id=$1',key);assert.equal(await check(),null);
  await db.$executeRawUnsafe('UPDATE "AcquisitionCredential" SET "expiresAt"=CURRENT_TIMESTAMP+INTERVAL \'1 hour\' WHERE id=$1',key);
  await db.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET enabled=FALSE WHERE agency=$1 AND location=$2 AND actor=$3',agency,LOCATION,actor);assert.equal(await check(),null);
  await db.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET enabled=TRUE,role=\'client_owner\' WHERE agency=$1 AND location=$2 AND actor=$3',agency,LOCATION,actor);assert.equal(await check(),null);
  await db.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET role=\'analysis_machine\' WHERE agency=$1 AND location=$2 AND actor=$3',agency,LOCATION,actor);
  await db.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET selected=FALSE WHERE agency=$1 AND location=$2',agency,LOCATION);assert.equal(await check(),null);
  await db.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET selected=TRUE WHERE agency=$1 AND location=$2',agency,LOCATION);assert.equal((await check())?.actor,actor);
  console.log('PASS new quote machine auth SQL: exact selected tenant/membership, both scopes required, expired/revoked/disabled/wrong-role/deselected refusal. Synthetic local data only.');
 }finally{await db.$disconnect();}
}
void main().catch(()=>{console.error('Synthetic quote authentication integration failed; connection errors withheld.');process.exitCode=1;});
