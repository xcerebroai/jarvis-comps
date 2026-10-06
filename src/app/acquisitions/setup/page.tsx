import {getSessionUser} from '../../../lib/auth';
import {redirect} from 'next/navigation';
import CredentialSetup from './setup';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getSessionUser();if(!user)redirect('/signin');if(!user.isAdmin||user.entitlement!=='active')return <main>Admin access required.</main>;return <CredentialSetup/>;}
