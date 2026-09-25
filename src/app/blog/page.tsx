import { ContentList } from '@/components/content-list'
import { recentArticles } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export default function BlogPage() {
	return (
		<main className='docs-container'>
			<h1>近期文章</h1>
			<ContentList items={recentArticles()} />
		</main>
	)
}
