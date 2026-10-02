import { NextResponse } from 'next/server'
import { isAdmin, sameOrigin } from '@/lib/site-auth'
import { listLegacyFiles, readLegacyFile, saveLegacyFiles } from '@/lib/legacy-files'
import { siteConfig } from '@/lib/site-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const types: Record<string, string> = {
	json: 'application/json; charset=utf-8',
	md: 'text/markdown; charset=utf-8',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	svg: 'image/svg+xml'
}

export async function GET(request: Request) {
	const url = new URL(request.url)
	if (url.searchParams.has('session')) return NextResponse.json({ authenticated: await isAdmin() }, { headers: { 'Cache-Control': 'no-store' } })
	try {
		const prefix = url.searchParams.get('prefix')
		if (prefix) return NextResponse.json({ files: await listLegacyFiles(prefix) }, { headers: { 'Cache-Control': 'no-store' } })
		const filePath =
			url.searchParams.get('path') ||
			(url.pathname.startsWith('/blogs/') || url.pathname.startsWith('/images/') || url.pathname === '/favicon.png' ? `public${url.pathname}` : '')
		if (filePath === 'src/config/site-content.json') return NextResponse.json(siteConfig(), { headers: { 'Cache-Control': 'no-store' } })
		const content = await readLegacyFile(filePath)
		if (!content) return NextResponse.json({ error: '文件不存在' }, { status: 404 })
		const ext = filePath.split('.').pop()?.toLowerCase() || ''
		return new Response(new Uint8Array(content), { headers: { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' } })
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : '请求失败' }, { status: 400 })
	}
}

export async function POST(request: Request) {
	if (!(await sameOrigin(request))) return NextResponse.json({ error: '请求来源无效' }, { status: 403 })
	if (!(await isAdmin())) return NextResponse.json({ error: '请先登录' }, { status: 401 })
	try {
		const input = await request.json()
		saveLegacyFiles(input.files)
		return NextResponse.json({ ok: true })
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 400 })
	}
}
