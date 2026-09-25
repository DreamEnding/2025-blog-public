import Link from 'next/link'
import { notFound } from 'next/navigation'
import { entries, sections } from '@/lib/site-db'

export const dynamic = 'force-dynamic'

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
	const id = Number((await params).id)
	const all = sections()
	const section = all.find(item => item.id === id)
	if (!section) notFound()
	const published = entries().filter(item => item.section_id === id || all.some(child => child.parent_id === id && child.id === item.section_id))
	if (section.kind === 'articles') published.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
	return (
		<main className='docs-container'>
			<Link href='/docs'>← 文档首页</Link>
			<h1>{section.name}</h1>
			{published.length ? (
				published.map(item => (
					<Link className='docs-list-item' key={item.id} href={`/docs/${item.id}`}>
						<strong>{item.public_title}</strong>
						<span>{item.public_summary}</span>
					</Link>
				))
			) : (
				<p className='docs-empty'>这里还没有已发布内容。</p>
			)}
		</main>
	)
}
