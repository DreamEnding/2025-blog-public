import { ContentList } from '@/components/content-list'
import { publishedIn } from '@/lib/content-sections'
import { pageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
	return pageMetadata('AI 技术分享', 'AI 工具、API 接入与开发实践。', '/ai-sharing')
}

export default function AiSharingPage() {
	return (
		<main className='docs-container tutorial-page'>
			<header className='tutorial-header'>
				<p className='tutorial-kicker'>技术实践 / NEXUS AI</p>
				<h1>AI 技术分享</h1>
				<p>AI 工具、API 接入与开发实践。</p>
			</header>
			<ContentList items={publishedIn('AI 技术分享')} />
		</main>
	)
}
