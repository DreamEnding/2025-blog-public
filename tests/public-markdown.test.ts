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

test('renders technical article sections and an interactive hierarchical directory using the document reader', async () => {
	const component = await PublicMarkdown({
		body: '## 主章节\n\n技术文章正文。\n\n### 子章节\n\n[项目文档](https://example.com/docs)\n\n```js\nconst example = 1\n```\n\n![示意图](/images/example.png)',
		tutorial: true,
		tocTitle: '文章目录'
	})
	const html = renderToStaticMarkup(component)
	assert.match(html, /<article class="docs-article prose tutorial-article"/)
	assert.match(html, /<h2 id="主章节">主章节<\/h2>/)
	assert.match(html, /<h3 id="子章节">子章节<\/h3>/)
	assert.match(html, /aria-label="文章目录"/)
	assert.match(html, /class="tutorial-toc-section"[^>]*href="#主章节"/)
	assert.match(html, /class="tutorial-toc-sub"[^>]*href="#子章节"/)
	assert.match(html, /class="tutorial-toc-toggle"[^>]*aria-expanded="false"/)
	assert.match(html, /class="tutorial-toc-progress"/)
	assert.match(html, /aria-label="复制代码"/)
	assert.match(html, /<img[^>]+alt="示意图"/)
})
