import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sameOrigin } from '@/lib/site-auth'
import { db } from '@/lib/site-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function likesDb() {
	return db()
}

function slugFrom(request: Request) {
	const slug = new URL(request.url).searchParams.get('slug') || ''
	return slug.length > 0 && slug.length <= 150 && /^[\p{L}\p{N}_./-]+$/u.test(slug) ? slug : null
}

export async function GET(request: Request) {
	const slug = slugFrom(request)
	if (!slug) return NextResponse.json({ error: '无效内容' }, { status: 400 })
	const row = likesDb().prepare('SELECT count FROM likes WHERE slug = ?').get(slug) as { count: number } | undefined
	return NextResponse.json({ count: row?.count || 0 }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
	if (!(await sameOrigin(request))) return NextResponse.json({ error: '请求来源无效' }, { status: 403 })
	const slug = slugFrom(request)
	if (!slug) return NextResponse.json({ error: '无效内容' }, { status: 400 })
	const connection = likesDb()
	const visitorCookie = (await cookies()).get('like_visitor')?.value
	const visitor = visitorCookie && /^[\da-f-]{36}$/.test(visitorCookie) ? visitorCookie : randomUUID()
	const now = Date.now()
	const result = connection.transaction(() => {
		const previous = connection.prepare('SELECT liked_at FROM like_events WHERE slug = ? AND visitor = ?').get(slug, visitor) as { liked_at: number } | undefined
		if (!previous || now - previous.liked_at >= 24 * 60 * 60 * 1000) {
			connection.prepare('INSERT INTO likes (slug, count) VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET count = count + 1').run(slug)
			connection.prepare('INSERT INTO like_events (slug, visitor, liked_at) VALUES (?, ?, ?) ON CONFLICT(slug, visitor) DO UPDATE SET liked_at = excluded.liked_at').run(slug, visitor, now)
		}
		const count = (connection.prepare('SELECT count FROM likes WHERE slug = ?').get(slug) as { count: number }).count
		return { count, ...(previous && now - previous.liked_at < 24 * 60 * 60 * 1000 ? { reason: 'rate_limited' } : {}) }
	})()
	const response = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
	if (!visitorCookie) response.cookies.set('like_visitor', visitor, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
	return response
}
