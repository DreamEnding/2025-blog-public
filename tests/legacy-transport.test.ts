import assert from 'node:assert/strict'
import test from 'node:test'
import { createBlob, createTree, toBase64Utf8 } from '../src/lib/github-client'

test('old editor tree changes reach the local save endpoint with files and deletions', async () => {
	const originalFetch = globalThis.fetch
	let submitted: { files: { path: string; content?: string; delete?: boolean }[] } | undefined
	globalThis.fetch = async (_url, options) => {
		submitted = JSON.parse(String(options?.body))
		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	}
	try {
		const blob = await createBlob('local', '', '', toBase64Utf8('# 中文标题'))
		await createTree('local', '', '', [
			{ path: 'public/blogs/example/index.md', mode: '100644', type: 'blob', sha: blob.sha },
			{ path: 'public/blogs/example/old.png', mode: '100644', type: 'blob', sha: null }
		])
		assert.equal(Buffer.from(submitted?.files[0].content || '', 'base64').toString(), '# 中文标题')
		assert.deepEqual(submitted?.files[1], { path: 'public/blogs/example/old.png', delete: true })
	} finally {
		globalThis.fetch = originalFetch
	}
})
