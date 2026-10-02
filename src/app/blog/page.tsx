import { ContentList } from '@/components/content-list'
import { recentArticles } from '@/lib/content-sections'
import { pageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
	return pageMetadata('近期文章', '阅读最新的使用教程和 AI 技术分享。', '/blog')
}

export default function BlogPage() {
	return (
		<main className='docs-container'>
			<h1>近期文章</h1>
			<ContentList items={recentArticles()} />
		</main>
	)
}
