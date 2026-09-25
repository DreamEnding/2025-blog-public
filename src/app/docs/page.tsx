import Link from 'next/link'
import { entries, sections, settings } from '@/lib/site-db'

export const dynamic = 'force-dynamic'

export default function DocsPage() {
	const allSections = sections()
	const published = entries()
	const site = settings()
	const roots = allSections.filter(section => section.parent_id === null)

	return (
		<main className='docs-container'>
			<h1>{site.name || 'API 文档'}</h1>
			<p className='docs-summary'>{site.intro || '查找接口文档、使用教程和技术文章。'}</p>
			<div className='docs-grid'>
				{roots.map(section => {
					const children = allSections.filter(item => item.parent_id === section.id)
					const count = published.filter(item => item.section_id === section.id || children.some(child => child.id === item.section_id)).length
					return (
						<Link key={section.id} href={`/sections/${section.id}`} className='docs-tile'>
							<span>{section.kind === 'docs' ? '文档' : '文章'}</span>
							<h2>{section.name}</h2>
							<p>{count ? `${count} 篇内容` : '内容准备中'}</p>
						</Link>
					)
				})}
			</div>
		</main>
	)
}
