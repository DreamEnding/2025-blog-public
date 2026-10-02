import { isAdmin } from '@/lib/site-auth'
import { AdminLogin, AdminWorkspace } from './workspace'
import { siteConfig } from '@/lib/site-config'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
	return <main className='docs-admin'>{(await isAdmin()) ? <AdminWorkspace /> : <AdminLogin logo={siteConfig().logo} />}</main>
}
