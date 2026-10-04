import { access, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'

// Noto CJK is licensed under SIL OFL; keep the font and its license together.
export async function ensureLoginFont(proxy) {
	const dir = path.join(homedir(), '.local', 'share', 'fonts', 'nexus-zhihu')
	const file = path.join(dir, 'NotoSansCJKsc-Regular.otf')
	try {
		await access(file)
		return
	} catch {}
	const require = createRequire('/app/package.json')
	const { fetch, ProxyAgent } = require('undici')
	const dispatcher = proxy ? new ProxyAgent(proxy) : undefined
	const base = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/'
	try {
		const signal = AbortSignal.timeout(12000)
		const response = await fetch(`${base}Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`, { dispatcher, signal })
		if (!response.ok) throw new Error('Font download unavailable')
		const chunks = []
		let size = 0
		for await (const chunk of response.body) {
			size += chunk.length
			if (size > 25 * 1024 * 1024) throw new Error('Font too large')
			chunks.push(chunk)
		}
		const bytes = Buffer.concat(chunks)
		if (bytes.subarray(0, 4).toString() !== 'OTTO') throw new Error('Invalid font')
		const license = await fetch(`${base}Sans/LICENSE`, { dispatcher, signal })
		if (!license.ok) throw new Error('Font license unavailable')
		await mkdir(dir, { recursive: true })
		await writeFile(path.join(dir, 'LICENSE'), await license.text())
		await writeFile(file, bytes)
		await new Promise((resolve, reject) => execFile('fc-cache', ['-f', dir], { timeout: 5000 }, error => (error ? reject(error) : resolve())))
	} finally {
		await dispatcher?.destroy()
	}
}
