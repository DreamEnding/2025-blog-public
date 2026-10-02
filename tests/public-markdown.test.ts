import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicMarkdown } from '../src/components/public-markdown'

test('renders the public article and working controls in the initial HTML', async () => {
	const component = await PublicMarkdown({
		body: '## 接入步骤\n\n无需等待客户端脚本即可阅读正文。\n\n```js\nconsole.log("你好")\n```\n\n![控制台](/tutorials/nexus-ai/image.png)',
		tutorial: true
	})
	const html = renderToStaticMarkup(component)
	assert.match(html, /<h2 id="接入步骤">接入步骤<\/h2>/)
	assert.match(html, /无需等待客户端脚本即可阅读正文。/)
	assert.match(html, /href="#接入步骤"/)
	assert.match(html, /aria-label="复制代码"/)
	assert.match(html, /<img[^>]+alt="控制台"/)
	assert.doesNotMatch(html, /正在渲染/)
})
