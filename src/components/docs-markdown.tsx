'use client'

import { useMarkdownRender } from '@/hooks/use-markdown-render'

export function DocsMarkdown({ body }: { body: string }) {
	const { content, toc, loading } = useMarkdownRender(body)
	return (
		<div className='docs-reader-grid'>
			<article className='docs-article prose'>{loading ? '正在渲染…' : content}</article>
			<aside className='docs-toc'>
				<b>本页目录</b>
				{toc.map((item, index) => (
					<a key={`${item.id}-${index}`} className={item.level === 3 ? 'docs-toc-sub' : ''} href={`#${item.id}`}>
						{item.text}
					</a>
				))}
			</aside>
		</div>
	)
}
