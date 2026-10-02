import { DocsMarkdown } from './docs-markdown'
import { renderMarkdown } from '@/lib/markdown-renderer'

export async function PublicMarkdown(props: { body: string; tutorial?: boolean; tocTitle?: string }) {
	const rendered = await renderMarkdown(props.body)
	return <DocsMarkdown {...props} rendered={rendered} />
}
