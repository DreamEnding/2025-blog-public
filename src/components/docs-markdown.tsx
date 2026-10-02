'use client'

import { useEffect, useState } from 'react'
import { Cloud, ListTree } from 'lucide-react'
import clsx from 'clsx'
import { useMarkdownRender } from '@/hooks/use-markdown-render'
import type { MarkdownRenderResult } from '@/lib/markdown-renderer'

export function DocsMarkdown({
	body,
	tutorial = false,
	tocTitle = '文章目录',
	rendered
}: {
	body: string
	tutorial?: boolean
	tocTitle?: string
	rendered?: MarkdownRenderResult
}) {
	const { content, toc, loading } = useMarkdownRender(body, rendered)
	const [activeId, setActiveId] = useState('')
	const [progress, setProgress] = useState(0)
	const [tocOpen, setTocOpen] = useState(false)

	useEffect(() => {
		if (!tutorial || !toc.length) return
		const update = () => {
			const maxScroll = document.documentElement.scrollHeight - window.innerHeight
			setProgress(maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 100)
			let current = toc[0].id
			for (const item of toc) {
				const heading = document.getElementById(item.id)
				if (heading && heading.getBoundingClientRect().top <= 180) current = item.id
			}
			setActiveId(current)
		}
		update()
		window.addEventListener('scroll', update, { passive: true })
		window.addEventListener('resize', update)
		return () => {
			window.removeEventListener('scroll', update)
			window.removeEventListener('resize', update)
		}
	}, [toc, tutorial])

	return (
		<div className={tutorial ? 'tutorial-reader' : 'docs-reader-grid'}>
			<article className={tutorial ? 'docs-article prose tutorial-article' : 'docs-article prose'}>{loading ? '正在渲染…' : content}</article>
			{tutorial ? (
				<aside className={clsx('tutorial-toc', tocOpen && 'is-open')} aria-label={tocTitle}>
					<button className='tutorial-toc-toggle' type='button' aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>
						<ListTree size={18} aria-hidden='true' />
						目录 <span>{progress}%</span>
					</button>
					<div className='tutorial-toc-panel'>
						<div className='tutorial-toc-head'>
							<ListTree size={19} aria-hidden='true' />
							<strong>{tocTitle}</strong>
							<span>{progress}%</span>
						</div>
						<div className='tutorial-toc-progress' aria-hidden='true'>
							<span style={{ width: `${progress}%` }} />
						</div>
						<nav aria-label='跳转到章节'>
							{toc.map(item => (
								<a
									key={item.id}
									className={clsx(item.level === 3 ? 'tutorial-toc-sub' : 'tutorial-toc-section', activeId === item.id && 'active')}
									href={`#${item.id}`}
									aria-current={activeId === item.id ? 'location' : undefined}
									onClick={() => setTocOpen(false)}>
									<Cloud size={14} fill='currentColor' aria-hidden='true' />
									<span>{item.text}</span>
								</a>
							))}
						</nav>
					</div>
				</aside>
			) : (
				<aside className='docs-toc'>
					<b>本页目录</b>
					{toc.map((item, index) => (
						<a key={`${item.id}-${index}`} className={item.level === 3 ? 'docs-toc-sub' : ''} href={`#${item.id}`}>
							{item.text}
						</a>
					))}
				</aside>
			)}
		</div>
	)
}
