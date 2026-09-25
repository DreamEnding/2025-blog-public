import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { dataDir } from '@/lib/site-db'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
	const { name } = await params
	if (!/^[\da-f-]{36}\.(png|jpg|webp|gif)$/.test(name)) return new Response(null, { status: 404 })
	try {
		const bytes = await readFile(path.join(dataDir(), 'uploads', name))
		const extension = name.split('.').at(-1)
		return new Response(bytes, {
			headers: {
				'Content-Type': extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
				'Cache-Control': 'public, max-age=31536000, immutable',
				'X-Content-Type-Options': 'nosniff'
			}
		})
	} catch {
		return new Response(null, { status: 404 })
	}
}
