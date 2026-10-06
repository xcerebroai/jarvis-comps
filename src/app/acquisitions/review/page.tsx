import {getSessionUser} from '../../../lib/auth';
import {db} from '../../../lib/db';
import {redirect} from 'next/navigation';
import ReviewControls from './review';
import {JARVIS_PREMIUM_LOCATION} from '../../../lib/acquisition-issuance';
export const dynamic='force-dynamic';
export default async function Page(){
 if(process.env.JARVIS_ACQUISITIONS_ENABLED!=='true')return <main>Acquisition review is not enabled.</main>;
 const user=await getSessionUser();if(!user)redirect('/signin');if(user.entitlement!=='active')return <main>Active access required.</main>;
 const tenants=await db.$queryRaw<{agency:string;role:string}[]>`SELECT m.agency,m.role FROM "AcquisitionMembership" m JOIN "AcquisitionSettings" s ON s.agency=m.agency AND s.location=m.location WHERE m.actor=${user.id} AND m.location=${JARVIS_PREMIUM_LOCATION} AND m.enabled=TRUE AND s.selected=TRUE AND m.role IN('owner_admin','human_reviewer')`;
 return <ReviewControls tenants={tenants}/>;
}
