import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/site-auth'
import { AdminWorkspace } from '@/app/admin/workspace'

export const dynamic = 'force-dynamic'

export default async function WritePage() {
	if (!(await isAdmin())) redirect('/admin?next=%2Fwrite')
	return (
		<main className='docs-admin'>
			<AdminWorkspace writerOnly />
		</main>
	)
}
