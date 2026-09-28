import { DocsMarkdown } from '@/components/docs-markdown'
import { publishedIn } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export default function ApiDocsPage() {
	const item = publishedIn('API 文档')[0]
	return (
		<main className='docs-container tutorial-page'>
			{item ? (
				<>
					<header className='tutorial-header'>
						<p className='tutorial-kicker'>开发文档 / NEXUS AI</p>
						<h1>{item.public_title}</h1>
						<p>{item.public_summary}</p>
					</header>
					<DocsMarkdown body={item.public_body || ''} tutorial tocTitle='接口目录' />
				</>
			) : (
				<>
					<h1>API 文档</h1>
					<p className='docs-empty'>API 文档即将发布。</p>
				</>
			)}
		</main>
	)
}
