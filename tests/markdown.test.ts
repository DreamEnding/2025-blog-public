import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/lib/markdown-renderer'

test('renders code and headings while rejecting unsafe HTML and links', async () => {
	const result = await renderMarkdown(
		'# 快速开始\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![x](javascript:alert(1))\n\n```js\nconst value = 1\n```'
	)
	assert.equal(result.toc[0].text, '快速开始')
	assert.match(result.html, /data-code=/)
	assert.doesNotMatch(result.html, /<script>/)
	assert.doesNotMatch(result.html, /href="javascript:/)
	assert.doesNotMatch(result.html, /src="javascript:/)
})

test('renders common documentation Markdown with working heading anchors', async () => {
	const result = await renderMarkdown(
		[
			'## **请求示例** `POST`',
			'',
			'参考 [**接口文档**](/docs/1)，也可查看 ![示例图](/api/uploads/example.png)。',
			'',
			'| 参数 | 必填 |',
			'| --- | --- |',
			'| key | 是 |',
			'',
			'- [x] 准备密钥',
			'',
			'> 使用 ~~旧接口~~ 新接口，公式 $a+b$。',
			'',
			'```js',
			'console.log("ready")',
			'```',
			'',
			'## 请求示例 POST'
		].join('\n')
	)
	assert.deepEqual(result.toc, [
		{ id: '请求示例-post', text: '请求示例 POST', level: 2 },
		{ id: '请求示例-post-2', text: '请求示例 POST', level: 2 }
	])
	assert.match(result.html, /<h2 id="请求示例-post"><strong>请求示例<\/strong> <code>POST<\/code><\/h2>/)
	assert.match(result.html, /<h2 id="请求示例-post-2">请求示例 POST<\/h2>/)
	assert.match(result.html, /<a href="\/docs\/1"[^>]*><strong>接口文档<\/strong><\/a>/)
	assert.match(result.html, /<img src="\/api\/uploads\/example.png"/)
	assert.match(result.html, /<table>/)
	assert.match(result.html, /type="checkbox" checked disabled/)
	assert.match(result.html, /<blockquote>/)
	assert.match(result.html, /<del>旧接口<\/del>/)
	assert.match(result.html, /class="katex"/)
	assert.match(result.html, /data-code=/)
})
