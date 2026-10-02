import type { MetadataRoute } from 'next'
import { publishedIn } from '@/lib/content-sections'
import { siteUrl } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = siteUrl()
	const paths = ['/', '/blog', '/api-docs', '/tutorials', '/ai-sharing', '/about']
	return [
		...paths.map(path => ({ url: `${baseUrl}${path}`, lastModified: new Date() })),
		...publishedIn('AI 技术分享').map(item => ({ url: `${baseUrl}/articles/${item.id}`, lastModified: new Date(item.published_at || Date.now()) }))
	]
}
