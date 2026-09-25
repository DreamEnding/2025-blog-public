'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

type CodeBlockProps = {
	children: React.ReactNode
	code: string
}

export function CodeBlock({ children, code }: CodeBlockProps) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (error) {
			console.error('Failed to copy code:', error)
		}
	}

	return (
		<div className='code-block-wrapper'>
			<button
				type='button'
				onClick={handleCopy}
				className='code-block-copy-btn'
				aria-label={copied ? '代码已复制' : '复制代码'}
				title={copied ? '已复制' : '复制代码'}>
				{copied ? <Check size={16} /> : <Copy size={16} />}
			</button>
			{children}
		</div>
	)
}
