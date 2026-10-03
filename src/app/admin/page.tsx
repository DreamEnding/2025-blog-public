import { isAdmin } from '@/lib/site-auth'
import { AdminLogin, AdminWorkspace } from './workspace'
import { siteConfig } from '@/lib/site-config'
import { adminData } from '@/lib/site-actions'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
	return <main className='admin-main'>{(await isAdmin()) ? <AdminWorkspace initialData={adminData()} /> : <AdminLogin logo={siteConfig().logo} />}</main>
}
