/** Explicit opt-in temporary Unix-socket database; never reads environment credentials. */
import {PrismaClient} from '@prisma/client';
import assert from 'node:assert/strict';
import {AcquisitionRepository} from './acquisition-repository';
const client=new PrismaClient({datasourceUrl:'postgresql://quentinflores@localhost:55439/postgres?host=/tmp/jarvis-acq-test-pg-socket'});
const repo=new AcquisitionRepository({query:async<T>(sql:string,params:unknown[])=>client.$queryRawUnsafe<T[]>(sql,...params)});
const c={agency:'SYNTHETIC-a',location:'SYNTHETIC-l',actor:'SYNTHETIC-human'};
try {
 assert.equal(await repo.loadAnalysis({...c,location:'SYNTHETIC-other'},'SYNTHETIC-1'),null);
 const replay=await repo.persist(c,'request1','digest1',{propertyId:'SYNTHETIC-house',valueUsd:'999'});
 assert.equal(replay.id,'SYNTHETIC-1');assert.equal((replay.result as {valueUsd:string}).valueUsd,'200000');
 await assert.rejects(repo.persist(c,'request1','different',{}),/Idempotency conflict/);
 assert.equal(await repo.consumeReview(c,'SYNTHETIC-review','packet','v1'),false);
 const review=await repo.saveReview(c,'newpacket','SYNTHETIC-2','v2',new Date(Date.now()+60000).toISOString());
 assert.equal(await repo.consumeReview(c,review.id,'wrongpacket','v2'),false);
 assert.equal(await repo.consumeReview(c,review.id,'newpacket','v2'),true);
 assert.equal(await repo.consumeReview(c,review.id,'newpacket','v2'),false);
 const guarded=await repo.saveReview(c,'guarded','SYNTHETIC-2','v2',new Date(Date.now()+60000).toISOString());
 await client.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET selected=FALSE WHERE agency=$1 AND location=$2',c.agency,c.location);
 assert.equal(await repo.consumeReview(c,guarded.id,'guarded','v2'),false);
 await client.$executeRawUnsafe('UPDATE "AcquisitionSettings" SET selected=TRUE WHERE agency=$1 AND location=$2',c.agency,c.location);
 await client.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET enabled=FALSE WHERE agency=$1 AND location=$2 AND actor=$3',c.agency,c.location,c.actor);
 assert.equal(await repo.consumeReview(c,guarded.id,'guarded','v2'),false);
 await client.$executeRawUnsafe('UPDATE "AcquisitionMembership" SET enabled=TRUE WHERE agency=$1 AND location=$2 AND actor=$3',c.agency,c.location,c.actor);
 await repo.hold(c,'SYNTHETIC-house','human_takeover');assert.equal(await repo.consumeReview(c,guarded.id,'guarded','v2'),false);
 await repo.hold(c,'SYNTHETIC-house','opt_out');assert.equal(await repo.consumeReview(c,guarded.id,'guarded','v2'),false);await repo.hold(c,'SYNTHETIC-house','human_takeover');assert.equal((await repo.isHeld(c,'SYNTHETIC-house'))?.reason,'opt_out');
 console.log('PASS: actual parameterized Postgres repository tenant isolation, canonical idempotency, conflict, stale review, wrong digest, exact single use, opt-out precedence, deselection, disabled reviewer/caller and human takeover. SYNTHETIC local socket only.');
} finally {await client.$disconnect();}
