import { NextResponse } from 'next/server'
import { entryPath, publishedIn, recentArticles } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

export function GET() {
	const recent = recentArticles().map(item => ({
		id: item.id,
		title: item.public_title,
		summary: item.public_summary,
		published_at: item.published_at,
		href: entryPath(item)
	}))
	const tutorials = publishedIn('使用教程').map(item => ({ id: item.id, title: item.public_title, summary: item.public_summary, href: entryPath(item) }))
	return NextResponse.json({ recent, tutorials }, { headers: { 'Cache-Control': 'no-store' } })
}
