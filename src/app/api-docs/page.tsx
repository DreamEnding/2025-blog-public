import { DocsMarkdown } from '@/components/docs-markdown'
import { publishedIn } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export default function ApiDocsPage() {
	const item = publishedIn('API 文档')[0]
	return (
		<main className='docs-container'>
			<h1>{item?.public_title || 'API 文档'}</h1>
			{item ? (
				<>
					<p className='docs-summary'>{item.public_summary}</p>
					<DocsMarkdown body={item.public_body || ''} />
				</>
			) : (
				<p className='docs-empty'>API 文档即将发布。</p>
			)}
		</main>
	)
}
