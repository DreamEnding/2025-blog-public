import { createServer } from 'node:http'

// A local RSSHub substitute for the disposable HTTP/UI verification instance.
const body = `<h2>在后台摘录技术文章</h2><p>这是一篇用于验证 RSS 摘录流程的文章，可编辑后发布到 AI 技术分享。</p>
<div class="highlight highlight-text-python"><pre>print(&quot;Hello, RSSHub&quot;)</pre></div>
<table><tr><th>环节</th><th>结果</th></tr><tr><td>导入</td><td>草稿</td></tr><tr><td>发布</td><td>公开可读</td></tr></table>
<p>公式：<img class="ztext-math" data-tex="E=mc^2" /></p><p><img src="http://127.0.0.1:2037/private.png" alt="失败图片测试" /></p>`
const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>技术分享验收订阅</title><link>https://example.com/</link>
<item><title>RSSHub 技术文章摘录验收</title><link>https://example.com/rss-verification-article</link><dc:creator>验收作者</dc:creator><pubDate>Sun, 04 Oct 2026 00:00:00 GMT</pubDate><description>技术文章摘要</description><content:encoded><![CDATA[${body}]]></content:encoded></item></channel></rss>`
createServer((request, response) => {
	if (request.url === '/error') {
		response.writeHead(403)
		response.end('Forbidden')
		return
	}
	response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' })
	response.end(xml)
}).listen(2037, '127.0.0.1', () => console.log('RSS fixture: http://127.0.0.1:2037'))
