import {createHash} from 'node:crypto';
import type {Sql,Tenant} from './headless-acquisitions';
import {LOCATION} from './native/contracts';

export type MachineScope='acquisitions:analyze'|'acquisitions:propose';
export type MachinePrincipal=Tenant&{policy:unknown};

/** Existing machine credential/membership/selected-location boundary. No session or new credential. */
export function machineTokenHash(request:Request):string|null {
 const header=request.headers.get('authorization');
 if(!header?.startsWith('Bearer '))return null;
 const token=header.slice(7);
 if(token.length<32||token.length>512||/\s/.test(token))return null;
 return createHash('sha256').update(token).digest('hex');
}
export async function authenticateMachine(sql:Sql,tokenHash:string,scopes:readonly MachineScope[]):Promise<MachinePrincipal|null>{
 const rows=await sql.query<MachinePrincipal>(`SELECT c.agency,c.location,c.actor,s.policy FROM "AcquisitionCredential" c JOIN "AcquisitionMembership" m ON m.agency=c.agency AND m.location=c.location AND m.actor=c.actor JOIN "AcquisitionSettings" s ON s.agency=c.agency AND s.location=c.location WHERE c."tokenHash"=$1 AND c.location=$2 AND c.revoked=FALSE AND c."expiresAt">CURRENT_TIMESTAMP AND $3::text[] <@ c.scopes AND m.enabled=TRUE AND m.role='analysis_machine' AND s.selected=TRUE`,[tokenHash,LOCATION,[...scopes]]);
 if(rows.length!==1||rows[0].location!==LOCATION||!rows[0].agency||!rows[0].actor)return null;
 return rows[0];
}
