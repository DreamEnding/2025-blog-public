import { ContentList } from '@/components/content-list'
import { publishedIn } from '@/lib/content-sections'
import { pageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
	return pageMetadata('AI 技术分享', 'AI 工具、API 接入与开发实践。', '/ai-sharing')
}

export default function AiSharingPage() {
	return (
		<main className='docs-container'>
			<h1>AI 技术分享</h1>
			<ContentList items={publishedIn('AI 技术分享')} />
		</main>
	)
}
