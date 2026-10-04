'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowUpRight, PencilLine, Plus, RefreshCw, Rss, Trash2, X } from 'lucide-react'
import type { RssItem, RssSubscription } from '@/lib/site-rss'
import type { PublicRssRuntime } from '@/lib/rss-runtime'
import RssSettings from './rss-settings'

const MarkdownPreview = dynamic(() => import('./markdown-preview'), { ssr: false })
type RssData = { rsshubUrl: string; configuration: PublicRssRuntime | null; subscriptions: RssSubscription[]; items: RssItem[] }
type Props = {
	active: boolean
	busy: boolean
	action: (name: string, payload?: Record<string, unknown>) => Promise<any>
	onTask: (task: () => Promise<void>) => Promise<void>
	onOpen: (id: number, warnings?: string[]) => Promise<void>
}

export default function RssPanel({ active, busy, action, onTask, onOpen }: Props) {
	const [data, setData] = useState<RssData>({ rsshubUrl: '', configuration: null, subscriptions: [], items: [] })
	const [selected, setSelected] = useState<number | undefined>()
	const [form, setForm] = useState({ id: undefined as number | undefined, name: '', url: '' })
	const [query, setQuery] = useState('')
	const [notice, setNotice] = useState('')
	const [preview, setPreview] = useState<{ id: number; title: string; body: string } | null>(null)
	const generation = useRef(0)
	const subscription = data.subscriptions.find(item => item.id === selected)
	const items = data.items.filter(item => `${item.title} ${item.author} ${item.summary}`.toLowerCase().includes(query.toLowerCase()))

	async function load(id?: number) {
		const token = ++generation.current
		const response = await fetch(`/api/manage/rss${id ? `?subscription=${id}` : ''}`, { cache: 'no-store' })
		const result = await response.json()
		if (!response.ok) throw new Error(result.error || '订阅读取失败')
		if (token !== generation.current) return
		setData(result)
		setSelected(id && result.subscriptions.some((item: RssSubscription) => item.id === id) ? id : result.subscriptions[0]?.id)
	}
	useEffect(() => {
		if (active) void onTask(() => load(selected))
		// Refresh on entering the panel, including after a backup restore.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active])

	return (
		<section className='admin-surface admin-rss-panel' hidden={!active} aria-label='RSS 订阅与摘录'>
			<div className='admin-section-heading'>
				<span className='admin-eyebrow'>
					<Rss size={15} /> RSSHUB
				</span>
				<h2>发现文章，整理成自己的收藏</h2>
				<p>刷新订阅，预览候选文章，再导入「AI 技术分享」草稿。正文和图片可继续编辑，准备好后手动发布。</p>
			</div>
			<RssSettings url={data.rsshubUrl} configuration={data.configuration} busy={busy} action={action} onTask={onTask} onSaved={() => load(selected)} />
			<div className='admin-rss-layout'>
				<aside className='admin-rss-subscriptions'>
					<h3>我的订阅</h3>
					{data.subscriptions.map(item => (
						<div key={item.id} className='admin-rss-subscription'>
							<button
								type='button'
								className='admin-button quiet'
								aria-pressed={selected === item.id}
								disabled={busy}
								onClick={() =>
									void onTask(async () => {
										await load(item.id)
										setPreview(null)
										setNotice('')
									})
								}>
								<Rss size={16} />
								<span>{item.name}</span>
							</button>
							<div className='admin-rss-subscription-tools'>
								<button
									type='button'
									className='admin-icon-button'
									disabled={busy}
									aria-label={`编辑订阅 ${item.name}`}
									onClick={() => setForm({ id: item.id, name: item.name, url: item.url })}>
									<PencilLine size={15} />
								</button>
								<button
									type='button'
									className='admin-icon-button'
									disabled={busy}
									aria-label={`删除订阅 ${item.name}`}
									onClick={() =>
										void onTask(async () => {
											await action('delete-subscription', { id: item.id })
											await load(item.id === selected ? undefined : selected)
											setForm({ id: undefined, name: '', url: '' })
											setPreview(null)
											setNotice('订阅已删除，已导入的文章继续保留。')
										})
									}>
									<Trash2 size={15} />
								</button>
							</div>
						</div>
					))}
					{!data.subscriptions.length && <p className='admin-empty-copy'>添加一个作者或专栏，开始收集文章。</p>}
					<form
						className='admin-rss-form'
						onSubmit={event => {
							event.preventDefault()
							void onTask(async () => {
								const id = await action('save-subscription', form)
								await load(Number(id))
								setForm({ id: undefined, name: '', url: '' })
								setPreview(null)
								setNotice('订阅已保存，点击刷新获取文章。')
							})
						}}>
						<h3>{form.id ? '编辑订阅' : '添加订阅'}</h3>
						<label>
							订阅名称
							<input
								value={form.name}
								disabled={busy}
								maxLength={160}
								required
								onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
								placeholder='作者或专栏名称'
							/>
						</label>
						<label>
							作者 / 专栏 / RSS 地址
							<input
								value={form.url}
								disabled={busy}
								required
								onChange={event => setForm(current => ({ ...current, url: event.target.value }))}
								placeholder='https://www.zhihu.com/people/…'
							/>
						</label>
						<p>支持知乎主页、专栏主页、RSSHub 路由（如 /zhihu/posts/people/用户名）及完整 RSS URL。</p>
						<div className='admin-rss-actions'>
							<button className='admin-button primary' type='submit' disabled={busy}>
								<Plus size={16} />
								{form.id ? '保存订阅' : '添加订阅'}
							</button>
							{form.id && (
								<button className='admin-button quiet' type='button' disabled={busy} onClick={() => setForm({ id: undefined, name: '', url: '' })}>
									取消
								</button>
							)}
						</div>
					</form>
				</aside>
				<div className='admin-rss-candidates'>
					<div className='admin-rss-list-heading'>
						<div>
							<h3>{subscription?.name || '候选文章'}</h3>
							<p>{subscription?.refreshed_at ? `上次刷新：${new Date(subscription.refreshed_at).toLocaleString('zh-CN')}` : '尚未刷新'}</p>
						</div>
						<button
							className='admin-button primary'
							type='button'
							disabled={busy || !selected}
							onClick={() =>
								void onTask(async () => {
									try {
										const result = await action('refresh-subscription', { id: selected })
										setNotice(`刷新完成，获取 ${result.count} 篇文章。`)
									} finally {
										await load(selected)
									}
								})
							}>
							<RefreshCw size={16} />
							{busy ? '处理中…' : '刷新订阅'}
						</button>
					</div>
					{subscription?.error && (
						<p className='admin-feedback error' role='alert'>
							{subscription.error}
						</p>
					)}
					{notice && (
						<p className='admin-feedback success' role='status'>
							{notice}
						</p>
					)}
					<label>
						筛选文章
						<input value={query} onChange={event => setQuery(event.target.value)} placeholder='搜索标题、作者或摘要' />
					</label>
					{items.map(item => (
						<article className='admin-rss-item' key={item.id}>
							<div className='admin-rss-item-meta'>
								<span>{item.author || '作者未提供'}</span>
								<span>{item.published_at ? item.published_at.slice(0, 10) : '日期未提供'}</span>
								<span>{item.entry_id ? (item.published ? '已发布' : '已导入草稿') : '待摘录'}</span>
							</div>
							<h3>{item.title}</h3>
							<p>{item.summary || '订阅未提供正文'}</p>
							<div className='admin-rss-actions'>
								<a className='admin-button quiet' href={item.link} target='_blank' rel='noreferrer'>
									查看原文
									<ArrowUpRight size={15} />
								</a>
								<button
									type='button'
									className='admin-button quiet'
									disabled={busy}
									onClick={() =>
										void onTask(async () => {
											const result = await action('preview-rss-item', { id: item.id })
											setPreview({ id: item.id, title: item.title, body: result.body })
										})
									}>
									预览摘录
								</button>
								<button
									type='button'
									className='admin-button primary'
									disabled={busy}
									onClick={() =>
										void onTask(async () => {
											if (item.entry_id) await onOpen(item.entry_id)
											else {
												const result = await action('import-rss-item', { id: item.id })
												await onOpen(result.id, result.warnings)
											}
										})
									}>
									<PencilLine size={15} />
									{item.entry_id ? '编辑文章' : '导入并编辑'}
								</button>
							</div>
						</article>
					))}
					{!items.length && <p className='admin-empty-copy'>暂无候选文章。刷新订阅后，可在这里选择要摘录的内容。</p>}
				</div>
			</div>
			{preview && (
				<div className='admin-rss-preview'>
					<div className='admin-rss-list-heading'>
						<h3>{preview.title}</h3>
						<button className='admin-icon-button' type='button' aria-label='关闭摘录预览' onClick={() => setPreview(null)}>
							<X size={18} />
						</button>
					</div>
					<MarkdownPreview body={preview.body} />
				</div>
			)}
		</section>
	)
}
