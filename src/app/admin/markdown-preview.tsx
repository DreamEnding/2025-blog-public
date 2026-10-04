'use client'

import { memo } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useMarkdownRender } from '@/hooks/use-markdown-render'

function MarkdownPreview({ body }: { body: string }) {
	const { content, loading, error } = useMarkdownRender(body)
	return (
		<div className='admin-preview-reader'>
			<div className='admin-preview-label'>
				<span>阅读预览</span>
				{loading && <LoaderCircle className='admin-spin' size={16} aria-label='更新预览中' />}
			</div>
			<article className='admin-preview-content prose'>
				{error ? (
					<p className='admin-feedback error' role='alert'>
						{error}
					</p>
				) : (
					content || (loading ? <div className='admin-loading'>正在准备预览…</div> : <p className='admin-empty-copy'>写下第一段文字，预览会出现在这里。</p>)
				)}
			</article>
		</div>
	)
}

export default memo(MarkdownPreview)
