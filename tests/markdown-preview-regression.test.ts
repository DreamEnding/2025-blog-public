import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdown-renderer'

test('renders RSS excerpts whose link text is the URL without recursive parsing', async () => {
	const url = 'https://github.com/sgl-project/sglang/pull/19102'
	const result = await renderMarkdown(`[${url}](${url})`)
	assert.ok(result.html.includes(`>${url}</a>`))
})

test('renders bare URLs, URL headings and nested formatting without losing content', async () => {
	const result = await renderMarkdown(
		'## https://example.com/guide\n\nhttps://example.com/raw\n\n[**接口** `POST`](https://example.com/api)\n\n- [项目](https://example.com/project)'
	)
	assert.match(result.html, /<h2[^>]*><a href="https:\/\/example.com\/guide"/)
	assert.match(result.html, /<a href="https:\/\/example.com\/raw"/)
	assert.match(result.html, /<strong>接口<\/strong> <code>POST<\/code>/)
	assert.match(result.html, /<li>[\s\S]*项目/)
})

test('keeps repeated and concurrent preview renders isolated', async () => {
	const bodies = Array.from(
		{ length: 12 },
		(_, index) => `## 预览 ${index}\n\n[接口 ${index}](https://example.com/${index})\n\n\`\`\`js\nconst preview = ${index}\n\`\`\``
	)
	const results = await Promise.all(bodies.map(body => renderMarkdown(body)))
	for (const [index, result] of results.entries()) {
		assert.equal(result.toc[0].text, `预览 ${index}`)
		assert.ok(result.html.includes(`data-code="const preview = ${index}"`))
	}
	for (const body of bodies) assert.match((await renderMarkdown(body)).html, /<pre data-code=/)
})
