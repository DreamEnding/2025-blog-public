import assert from 'node:assert/strict'
import { test } from 'node:test'

test('does not request browser session while imported on the server', async () => {
	const originalFetch = globalThis.fetch
	let requests = 0
	globalThis.fetch = async () => {
		requests++
		return new Response('{}')
	}
	try {
		await import('../src/hooks/use-auth')
		assert.equal(requests, 0)
	} finally {
		globalThis.fetch = originalFetch
	}
})
