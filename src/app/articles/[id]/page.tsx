import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { PublicMarkdown } from '@/components/public-markdown'
import { publicEntry, sections } from '@/lib/site-db'
import { pageMetadata } from '@/lib/site-metadata'
import { entryPath } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
	const item = publicEntry(Number((await params).id))
	if (!item) return { title: '内容不存在', robots: { index: false, follow: false } }
	return pageMetadata(item.public_title || '', item.public_summary || '', entryPath(item))
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
	const id = (await params).id
	if (!/^[1-9]\d*$/.test(id)) notFound()
	const item = publicEntry(Number(id))
	const name = sections().find(section => section.id === item?.section_id)?.name
	if (!item || (name !== '使用教程' && name !== 'AI 技术分享')) notFound()
	if (name === '使用教程') redirect('/tutorials')
	return (
		<main className='docs-container'>
			<Link href='/ai-sharing'>← {name}</Link>
			<h1>{item.public_title}</h1>
			<p className='docs-summary'>{item.public_summary}</p>
			<PublicMarkdown body={item.public_body || ''} />
		</main>
	)
}
