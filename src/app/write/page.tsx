import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/site-auth'
import { AdminWorkspace } from '@/app/admin/workspace'
import { adminData } from '@/lib/site-actions'

export const dynamic = 'force-dynamic'

export default async function WritePage() {
	if (!(await isAdmin())) redirect('/admin?next=%2Fwrite')
	return (
		<main className='admin-main'>
			<AdminWorkspace initialData={adminData()} writerOnly />
		</main>
	)
}
