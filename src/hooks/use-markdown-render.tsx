import { useEffect, useMemo, useState, type ReactElement, Fragment } from 'react'
import parse, { type HTMLReactParserOptions, Element, type DOMNode } from 'html-react-parser'
import { renderMarkdown, type MarkdownRenderResult, type TocItem } from '@/lib/markdown-renderer'
import { MarkdownImage } from '@/components/markdown-image'
import { CodeBlock } from '@/components/code-block'

function markdownContent(html: string): ReactElement {
	const codeBlocks: Array<{ code: string; html: string }> = []
	const processedHtml = html.replace(/<pre\s+data-code="([^"]*)"([^>]*)>([\s\S]*?)<\/pre>/g, (_match, codeAttr, _attrs, content) => {
		const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
		const code = codeAttr
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
		codeBlocks.push({ code, html: content })
		return placeholder
	})
	const options: HTMLReactParserOptions = {
		replace(domNode: DOMNode) {
			if (domNode instanceof Element && domNode.name === 'img') {
				const { src, alt, title } = domNode.attribs
				return <MarkdownImage src={src} alt={alt} title={title} />
			}
			if (domNode.type === 'text' && domNode.data?.includes('__CODE_BLOCK_')) {
				return (
					<>
						{domNode.data
							.split(/(__CODE_BLOCK_\d+__)/)
							.filter(Boolean)
							.map((item, index) => {
								const match = /^__CODE_BLOCK_(\d+)__$/.exec(item)
								const block = match ? codeBlocks[Number(match[1])] : undefined
								return block ? (
									<CodeBlock key={index} code={block.code}>
										{parse(block.html)}
									</CodeBlock>
								) : (
									<Fragment key={index}>{item}</Fragment>
								)
							})}
					</>
				)
			}
		}
	}
	return parse(processedHtml, options) as ReactElement
}

export function useMarkdownRender(markdown: string, rendered?: MarkdownRenderResult) {
	const prepared = useMemo(() => (rendered ? { content: markdownContent(rendered.html), toc: rendered.toc, loading: false, error: '' } : null), [rendered])
	const [content, setContent] = useState<ReactElement | null>(null)
	const [toc, setToc] = useState<TocItem[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	useEffect(() => {
		if (prepared) return
		let cancelled = false
		setLoading(true)
		setError('')
		renderMarkdown(markdown)
			.then(result => {
				if (!cancelled) {
					setContent(markdownContent(result.html))
					setToc(result.toc)
				}
			})
			.catch(cause => {
				console.error('Markdown render error:', cause instanceof Error ? cause.message.split('\n')[0] : 'Unknown error')
				if (!cancelled) {
					setContent(null)
					setToc([])
					setError('预览渲染失败，正文已保留。')
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [markdown, prepared])

	return prepared || { content, toc, loading, error }
}
