import {randomUUID} from 'node:crypto';
import {AcquisitionReviewRequired} from './acquisition-analysis';
import type {AcquisitionContext} from './acquisition-handler';
import type {Credential} from './acquisition-auth';
export interface BoundSql {query<T>(sql:string,parameters:unknown[]):Promise<T[]>;}
/** Fixed parameterized SQL for the existing Postgres host. No DDL auto-run. */
export class AcquisitionRepository {
 private readonly sql:BoundSql;
 constructor(sql:BoundSql){this.sql=sql;}
 async byTokenHash(hash:string):Promise<Credential|null>{
  const rows=await this.sql.query<Credential>('SELECT id,agency,location,actor,scopes,"expiresAt",revoked FROM "AcquisitionCredential" WHERE "tokenHash"=$1',[hash]);return rows[0]??null;
 }
 async byKeyId(id:string):Promise<Credential|null>{
  const rows=await this.sql.query<Credential>('SELECT id,agency,location,actor,scopes,"expiresAt",revoked FROM "AcquisitionCredential" WHERE id=$1',[id]);return rows[0]??null;
 }
 async settings(c:AcquisitionContext){
  const rows=await this.sql.query<{selected:boolean;policy:unknown}>(`SELECT s.selected,s.policy FROM "AcquisitionSettings" s JOIN "AcquisitionMembership" m ON m.agency=s.agency AND m.location=s.location WHERE s.agency=$1 AND s.location=$2 AND m.actor=$3 AND m.enabled=TRUE`,[c.agency,c.location,c.actor]);return rows[0]??null;
 }
 async persist(c:AcquisitionContext,requestId:string,digest:string,result:unknown){
  const id=randomUUID(),version=randomUUID();
  const rows=await this.sql.query<{id:string;version:string;requestDigest:string;result:unknown}>(`INSERT INTO "AcquisitionAnalysis" (id,version,agency,location,"requestId","requestDigest",result) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (agency,location,"requestId") DO UPDATE SET "requestDigest"="AcquisitionAnalysis"."requestDigest" RETURNING id,version,"requestDigest",result`,[id,version,c.agency,c.location,requestId,digest,JSON.stringify(result)]);
  const row=rows[0];if(!row||row.requestDigest!==digest)throw new AcquisitionReviewRequired('Idempotency conflict');return row;
 }
 async loadRequest(c:AcquisitionContext,requestId:string){
  const rows=await this.sql.query<{id:string;version:string;requestDigest:string;result:unknown}>('SELECT id,version,"requestDigest",result FROM "AcquisitionAnalysis" WHERE agency=$1 AND location=$2 AND "requestId"=$3',[c.agency,c.location,requestId]);return rows[0]??null;
 }
 async loadAnalysis(c:AcquisitionContext,id:string){
  const rows=await this.sql.query<{id:string;version:string;result:unknown}>('SELECT id,version,result FROM "AcquisitionAnalysis" WHERE agency=$1 AND location=$2 AND id=$3',[c.agency,c.location,id]);return rows[0]??null;
 }
 async hold(c:AcquisitionContext,propertyId:string,reason:'opt_out'|'human_takeover'){
  await this.sql.query(`INSERT INTO "AcquisitionHold" (agency,location,"propertyId",reason) VALUES ($1,$2,$3,$4) ON CONFLICT (agency,location,"propertyId") DO UPDATE SET reason=CASE WHEN "AcquisitionHold".reason='opt_out' THEN 'opt_out' ELSE EXCLUDED.reason END RETURNING reason`,[c.agency,c.location,propertyId,reason]);
 }
 async isHeld(c:AcquisitionContext,propertyId:string){
  const rows=await this.sql.query<{reason:string}>('SELECT reason FROM "AcquisitionHold" WHERE agency=$1 AND location=$2 AND "propertyId"=$3',[c.agency,c.location,propertyId]);return rows[0]??null;
 }
 async saveReview(c:AcquisitionContext,packetDigest:string,analysisId:string,analysisVersion:string,expiresAt:string){
  // Caller MUST be an authenticated human, never a machine credential actor.
  const expires=Date.parse(expiresAt);if(!Number.isFinite(expires)||expires<=Date.now())throw new AcquisitionReviewRequired('Invalid review expiry');
  const analysis=await this.loadAnalysis(c,analysisId);if(!analysis||analysis.version!==analysisVersion)throw new AcquisitionReviewRequired('Analysis version mismatch');
  const rows=await this.sql.query<{id:string}>(`INSERT INTO "AcquisitionReview" (id,agency,location,"humanActor","packetDigest","analysisId","analysisVersion","expiresAt") SELECT $1,$2,$3,$4,$5,$6,$7,$8::timestamptz FROM "AcquisitionMembership" WHERE agency=$2 AND location=$3 AND actor=$4 AND enabled=TRUE AND role='human_reviewer' AND EXISTS (SELECT 1 FROM "AcquisitionSettings" s WHERE s.agency=$2 AND s.location=$3 AND s.selected=TRUE) AND EXISTS (SELECT 1 FROM "AcquisitionAnalysis" a WHERE a.agency=$2 AND a.location=$3 AND a.id=$6 AND a.version=$7 AND a.result->>'propertyId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AcquisitionHold" h WHERE h.agency=a.agency AND h.location=a.location AND h."propertyId"=a.result->>'propertyId') AND NOT EXISTS (SELECT 1 FROM "AcquisitionAnalysis" newer WHERE newer.agency=a.agency AND newer.location=a.location AND newer.result->>'propertyId'=a.result->>'propertyId' AND newer."sequence">a."sequence")) RETURNING id`,[randomUUID(),c.agency,c.location,c.actor,packetDigest,analysisId,analysisVersion,expiresAt]);
  if(!rows[0])throw new AcquisitionReviewRequired('Authenticated human reviewer membership required');return rows[0];
 }
 async consumeReview(c:AcquisitionContext,id:string,digest:string,analysisVersion:string){
  // Atomic single-use, exact packet/version, unexpired, nonrevoked; no delivery.
  const rows=await this.sql.query<{id:string}>(`UPDATE "AcquisitionReview" r SET "usedAt"=CURRENT_TIMESTAMP FROM "AcquisitionAnalysis" a WHERE r.agency=$1 AND r.location=$2 AND r.id=$3 AND r."packetDigest"=$4 AND r."analysisVersion"=$5 AND r."usedAt" IS NULL AND r.revoked=FALSE AND r."expiresAt">CURRENT_TIMESTAMP AND a.agency=r.agency AND a.location=r.location AND a.id=r."analysisId" AND a.version=r."analysisVersion" AND EXISTS (SELECT 1 FROM "AcquisitionSettings" s WHERE s.agency=r.agency AND s.location=r.location AND s.selected=TRUE) AND EXISTS (SELECT 1 FROM "AcquisitionMembership" m WHERE m.agency=r.agency AND m.location=r.location AND m.actor=r."humanActor" AND m.role='human_reviewer' AND m.enabled=TRUE) AND EXISTS (SELECT 1 FROM "AcquisitionMembership" caller WHERE caller.agency=r.agency AND caller.location=r.location AND caller.actor=$6 AND caller.enabled=TRUE AND caller.role IN('human_reviewer','offer_dispatcher')) AND NOT EXISTS (SELECT 1 FROM "AcquisitionHold" h WHERE h.agency=r.agency AND h.location=r.location AND h."propertyId"=a.result->>'propertyId') AND a.result->>'propertyId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AcquisitionAnalysis" newer WHERE newer.agency=a.agency AND newer.location=a.location AND newer.result->>'propertyId'=a.result->>'propertyId' AND newer."sequence">a."sequence") RETURNING r.id`,[c.agency,c.location,id,digest,analysisVersion,c.actor]);return Boolean(rows[0]);
 }
}
