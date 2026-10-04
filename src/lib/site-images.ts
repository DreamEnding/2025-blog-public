import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { marked, type Tokens } from 'marked'
import { dataDir } from './site-db'
import { fetchLimited, httpUrl } from './rss-network'

export const imageTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function storeImage(bytes: Buffer, type: string) {
	if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('图片大小必须在 1B 到 8MB 之间')
	const extension = imageTypes[type]
	if (!extension) throw new Error('只支持 PNG、JPEG、WebP 和 GIF')
	const valid =
		extension === 'png'
			? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
			: extension === 'jpg'
				? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
				: extension === 'gif'
					? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())
					: bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
	if (!valid) throw new Error('图片内容与格式不符')
	const filename = `${randomUUID()}.${extension}`
	await mkdir(path.join(dataDir(), 'uploads'), { recursive: true })
	await writeFile(path.join(dataDir(), 'uploads', filename), bytes)
	return `/api/uploads/${filename}`
}

export async function importImage(value: unknown, referer?: string) {
	const url = httpUrl(value)
	const result = await fetchLimited(
		url.href,
		8 * 1024 * 1024,
		undefined,
		referer || (url.hostname.endsWith('.zhimg.com') ? 'https://www.zhihu.com/' : undefined)
	)
	return storeImage(result.bytes, result.type)
}

export async function listImages() {
	const dir = path.join(dataDir(), 'uploads')
	await mkdir(dir, { recursive: true })
	const names = (await readdir(dir)).filter(name => /^[\da-f-]{36}\.(png|jpg|webp|gif)$/.test(name))
	return (
		await Promise.all(
			names.map(async name => {
				const file = await stat(path.join(dir, name))
				return { name, url: `/api/uploads/${name}`, size: file.size, modified: file.mtime.toISOString() }
			})
		)
	).sort((a, b) => b.modified.localeCompare(a.modified))
}

export async function localizeImages(body: string, referer?: string) {
	const images: Tokens.Image[] = []
	marked.walkTokens(marked.lexer(body), token => {
		if (token.type === 'image' && /^https?:\/\//i.test(token.href)) images.push(token as Tokens.Image)
	})
	const urls = [...new Set(images.map(image => image.href))]
	if (urls.length > 100) throw new Error('单篇文章最多转存 100 张远程图片')
	const replacements = new Map<string, string>()
	const warnings: string[] = []
	// Limit concurrency so a large article cannot monopolize outbound connections.
	for (let i = 0; i < urls.length; i += 4) {
		await Promise.all(
			urls.slice(i, i + 4).map(async url => {
				try {
					replacements.set(url, await importImage(url, referer))
				} catch (error) {
					warnings.push(`${url}：${error instanceof Error ? error.message : '图片转存失败'}`)
				}
			})
		)
	}
	return { body: replaceImageUrls(body, replacements), warnings, count: replacements.size }
}

export function replaceImageUrls(body: string, replacements: Map<string, string>) {
	const images: Tokens.Image[] = []
	const protectedCode = new Map<string, string>()
	marked.walkTokens(marked.lexer(body), token => {
		if (token.type === 'image') images.push(token as Tokens.Image)
		if (['code', 'codespan', 'html'].includes(token.type)) protectedCode.set(token.raw, `RSS-CODE-${randomUUID()}`)
	})
	for (const [raw, placeholder] of protectedCode) body = body.replaceAll(raw, placeholder)
	for (const image of images) {
		const url = replacements.get(image.href)
		if (url) {
			const raw = `![${image.text.replace(/[\[\]\\]/g, '\\$&')}](${url})`
			body = body.replaceAll(image.raw, raw)
		}
	}
	for (const [raw, placeholder] of protectedCode) body = body.replaceAll(placeholder, raw)
	return body
}
