import siteContent from '@/config/site-content.json'
import { recentArticles } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

const origin = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:2025').replace(/\/$/, '')
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function GET() {
	const items = recentArticles()
		.map(item => {
			const link = `${origin}/articles/${item.id}`
			return `<item><title>${escapeXml(item.public_title || '')}</title><link>${link}</link><guid>${link}</guid><description>${escapeXml(item.public_summary || '')}</description><pubDate>${new Date(item.published_at || 0).toUTCString()}</pubDate></item>`
		})
		.join('')
	const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(siteContent.meta.title)}</title><link>${origin}</link><description>${escapeXml(siteContent.meta.description)}</description><language>zh-CN</language>${items}</channel></rss>`
	return new Response(rss, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store' } })
}
