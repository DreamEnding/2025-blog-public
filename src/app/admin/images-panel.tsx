'use client'

import { useEffect, useState } from 'react'
import { Copy, ImagePlus, Upload } from 'lucide-react'

type Image = { name: string; url: string; size: number; modified: string }
type Props = {
	active: boolean
	busy: boolean
	canInsert: boolean
	action: (name: string, payload?: Record<string, unknown>) => Promise<any>
	onTask: (task: () => Promise<void>) => Promise<void>
	onInsert: (url: string) => void
}

export default function ImagesPanel({ active, busy, canInsert, action, onTask, onInsert }: Props) {
	const [images, setImages] = useState<Image[]>([])
	const [remoteUrl, setRemoteUrl] = useState('')
	const [selected, setSelected] = useState<Image | null>(null)
	const [notice, setNotice] = useState('')
	async function load() {
		const response = await fetch('/api/manage/images', { cache: 'no-store' })
		const result = await response.json()
		if (!response.ok) throw new Error(result.error || '图片库读取失败')
		setImages(result)
		setSelected(null)
	}
	useEffect(() => {
		if (active) void onTask(load)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active])

	return (
		<section className='admin-surface admin-images-panel' hidden={!active} aria-label='图片库'>
			<div className='admin-section-heading'>
				<span className='admin-eyebrow'>
					<ImagePlus size={15} /> IMAGES
				</span>
				<h2>文章配图，随时取用</h2>
				<p>上传或转存图片，点击缩略图放大预览。插入当前草稿后，可在 Markdown 编辑器修改说明或替换图片地址。</p>
			</div>
			<div className='admin-rss-actions'>
				<label className='admin-button quiet admin-file-button'>
					<Upload size={16} />
					上传图片
					<input
						type='file'
						hidden
						accept='image/png,image/jpeg,image/webp,image/gif'
						disabled={busy}
						onChange={event => {
							const file = event.target.files?.[0]
							event.target.value = ''
							if (!file) return
							void onTask(async () => {
								const form = new FormData()
								form.append('file', file)
								const response = await fetch('/api/manage/upload', { method: 'POST', body: form })
								const result = await response.json()
								if (!response.ok) throw new Error(result.error || '图片上传失败')
								await load()
								setNotice('图片已上传。')
							})
						}}
					/>
				</label>
				<span className='admin-empty-copy'>PNG / JPEG / WebP / GIF，每张最多 8MB</span>
			</div>
			<form
				className='admin-rss-base'
				onSubmit={event => {
					event.preventDefault()
					void onTask(async () => {
						await action('import-image', { url: remoteUrl })
						await load()
						setRemoteUrl('')
						setNotice('远程图片已转存到本站。')
					})
				}}>
				<label>
					远程图片地址
					<input
						type='url'
						required
						value={remoteUrl}
						disabled={busy}
						onChange={event => setRemoteUrl(event.target.value)}
						placeholder='https://pic…zhimg.com/…'
					/>
				</label>
				<button className='admin-button primary' type='submit' disabled={busy}>
					转存图片
				</button>
			</form>
			{notice && (
				<p className='admin-feedback success' role='status'>
					{notice}
				</p>
			)}
			{selected && (
				<div className='admin-image-preview'>
					<img src={selected.url} alt='图片预览' />
					<button type='button' className='admin-button quiet' onClick={() => setSelected(null)}>
						收起预览
					</button>
				</div>
			)}
			<div className='admin-images-grid'>
				{images.map(image => (
					<article className='admin-image-card' key={image.name}>
						<button type='button' className='admin-image-thumbnail' aria-label={`预览图片 ${image.name}`} onClick={() => setSelected(image)}>
							<img src={image.url} alt={image.name} loading='lazy' />
						</button>
						<p>
							{Math.ceil(image.size / 1024)} KB · {image.modified.slice(0, 10)}
						</p>
						<div className='admin-rss-actions'>
							<button
								className='admin-button quiet'
								type='button'
								disabled={busy}
								onClick={() =>
									void onTask(async () => {
										await navigator.clipboard.writeText(image.url)
										setNotice('图片地址已复制。')
									})
								}>
								<Copy size={15} />
								复制地址
							</button>
							<button className='admin-button primary' type='button' disabled={busy || !canInsert} onClick={() => onInsert(image.url)}>
								插入草稿
							</button>
						</div>
					</article>
				))}
			</div>
			{!images.length && <p className='admin-empty-copy'>图片库为空。上传图片或导入 RSS 文章后，配图会出现在这里。</p>}
		</section>
	)
}
