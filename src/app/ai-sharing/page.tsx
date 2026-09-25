import { ContentList } from '@/components/content-list'
import { publishedIn } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export default function AiSharingPage() {
	return (
		<main className='docs-container'>
			<h1>AI 技术分享</h1>
			<ContentList items={publishedIn('AI 技术分享')} />
		</main>
	)
}
