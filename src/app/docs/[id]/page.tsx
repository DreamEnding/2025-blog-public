import Link from 'next/link'
import { notFound } from 'next/navigation'
import { entries, publicEntry, sections } from '@/lib/site-db'
import { DocsMarkdown } from '@/components/docs-markdown'

export const dynamic = 'force-dynamic'

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
	const item = publicEntry(Number((await params).id))
	if (!item) notFound()
	const allSections = sections()
	const currentSection = allSections.find(section => section.id === item.section_id)
	const allEntries = entries()
	return (
		<main className='docs-reading'>
			<aside className='docs-sidebar'>
				<Link href='/docs'>← 文档首页</Link>
				{allSections
					.filter(section => section.parent_id === null)
					.map(section => (
						<div key={section.id}>
							<Link className='docs-sidebar-heading' href={`/sections/${section.id}`}>
								{section.name}
							</Link>
							{allSections
								.filter(child => child.parent_id === section.id)
								.map(child => (
									<div key={child.id}>
										<span className='docs-sidebar-group'>{child.name}</span>
										{allEntries
											.filter(doc => doc.section_id === child.id)
											.map(doc => (
												<Link className={doc.id === item.id ? 'active' : ''} key={doc.id} href={`/docs/${doc.id}`}>
													{doc.public_title}
												</Link>
											))}
									</div>
								))}
							{allEntries
								.filter(doc => doc.section_id === section.id)
								.map(doc => (
									<Link className={doc.id === item.id ? 'active' : ''} key={doc.id} href={`/docs/${doc.id}`}>
										{doc.public_title}
									</Link>
								))}
						</div>
					))}
			</aside>
			<div className='docs-reading-main'>
				<div className='docs-breadcrumb'>
					<Link href={`/sections/${currentSection?.parent_id || currentSection?.id}`}>{currentSection?.name}</Link> / {item.public_title}
				</div>
				<h1>{item.public_title}</h1>
				{item.public_summary && <p className='docs-summary'>{item.public_summary}</p>}
				<DocsMarkdown body={item.public_body || ''} />
			</div>
		</main>
	)
}
