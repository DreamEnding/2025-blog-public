import type { MetadataRoute } from 'next'
import { recentArticles } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:2025').replace(/\/$/, '')
	const paths = ['/', '/blog', '/api-docs', '/tutorials', '/ai-sharing', '/about']
	return [
		...paths.map(path => ({ url: `${baseUrl}${path}`, lastModified: new Date() })),
		...recentArticles().map(item => ({ url: `${baseUrl}/articles/${item.id}`, lastModified: new Date(item.published_at || Date.now()) }))
	]
}
