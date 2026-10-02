import Link from 'next/link'
import type { Entry } from '@/lib/site-db'
import { entryPath } from '@/lib/content-sections'

export function ContentList({ items, empty = '暂无已发布文章。' }: { items: Entry[]; empty?: string }) {
	if (!items.length) return <p className='docs-empty'>{empty}</p>
	return (
		<div className='grid gap-5 sm:grid-cols-2'>
			{items.map(item => (
				<Link className='card relative block space-y-3 p-6 transition-transform hover:-translate-y-1' key={item.id} href={entryPath(item)}>
					<h2 className='text-lg font-bold'>{item.public_title}</h2>
					<p className='text-secondary line-clamp-3 text-sm'>{item.public_summary || (item.public_body || '').replace(/[#*`>\[\]]/g, '').slice(0, 120)}</p>
					<small className='text-secondary'>{item.published_at ? new Date(item.published_at).toLocaleDateString('zh-CN') : ''}</small>
				</Link>
			))}
		</div>
	)
}
