import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DocsMarkdown } from '@/components/docs-markdown'
import { publicEntry, sections } from '@/lib/site-db'

export const dynamic = 'force-dynamic'

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
	const id = (await params).id
	if (!/^[1-9]\d*$/.test(id)) notFound()
	const item = publicEntry(Number(id))
	const name = sections().find(section => section.id === item?.section_id)?.name
	if (!item || (name !== '使用教程' && name !== 'AI 技术分享')) notFound()
	return (
		<main className='docs-container'>
			<Link href={name === '使用教程' ? '/tutorials' : '/ai-sharing'}>← {name}</Link>
			<h1>{item.public_title}</h1>
			<p className='docs-summary'>{item.public_summary}</p>
			<DocsMarkdown body={item.public_body || ''} />
		</main>
	)
}
