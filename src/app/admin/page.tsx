import { isAdmin } from '@/lib/site-auth'
import { AdminLogin, AdminWorkspace } from './workspace'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
	return <main className='docs-admin'>{(await isAdmin()) ? <AdminWorkspace /> : <AdminLogin />}</main>
}
