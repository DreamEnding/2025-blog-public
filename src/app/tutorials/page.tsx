import { ContentList } from '@/components/content-list'
import { publishedIn } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export default function TutorialsPage() {
	return (
		<main className='docs-container'>
			<h1>使用教程</h1>
			<ContentList items={publishedIn('使用教程')} />
		</main>
	)
}
