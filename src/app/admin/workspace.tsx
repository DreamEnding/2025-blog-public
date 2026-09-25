'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DocsMarkdown } from '@/components/docs-markdown'
import type { Entry, Section } from '@/lib/site-db'
import { BookOpenText, DatabaseBackup, Layers3, LogOut, Settings2 } from 'lucide-react'

type Data = { sections: Section[]; entries: Entry[]; settings: Record<string, string> }

async function action(name: string, payload: Record<string, unknown> = {}) {
	const response = await fetch(`/api/manage/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
	const result = await response.json()
	if (!response.ok) throw new Error(result.error || '操作失败')
	return result.result
}

export function AdminLogin() {
	const router = useRouter()
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	async function submit(event: FormEvent) {
		event.preventDefault()
		try {
			await action('login', { username, password })
			const next = new URLSearchParams(window.location.search).get('next')
			if (next?.startsWith('/') && !next.startsWith('//')) window.location.assign(next)
			else router.refresh()
		} catch (cause) {
			setError((cause as Error).message)
		}
	}
	return (
		<form className='docs-panel docs-login' onSubmit={submit}>
			<div className='docs-login-identity'>
				<img src='/images/avatar.png' alt='' />
				<span>站点管理</span>
			</div>
			<h1>管理员登录</h1>
			<p className='docs-login-description'>登录后管理文档、栏目与站点内容。</p>
			<label>
				账号
				<input value={username} onChange={event => setUsername(event.target.value)} autoComplete='username' required />
			</label>
			<label>
				密码
				<input type='password' value={password} onChange={event => setPassword(event.target.value)} autoComplete='current-password' required />
			</label>
			<button type='submit'>登录</button>
			{error && <p role='alert'>{error}</p>}
		</form>
	)
}

export function AdminWorkspace() {
	const router = useRouter()
	const [data, setData] = useState<Data | null>(null)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [tab, setTab] = useState<'content' | 'sections' | 'settings' | 'backup'>('content')
	const [currentId, setCurrentId] = useState<number | null>(null)
	const [draft, setDraft] = useState<Entry | null>(null)
	const [viewMode, setViewMode] = useState<'edit' | 'split' | 'preview'>('edit')
	const [busy, setBusy] = useState(false)
	const [sectionForm, setSectionForm] = useState({ name: '', kind: 'docs', parent_id: '', position: 0 })
	const [siteForm, setSiteForm] = useState<Record<string, string>>({})
	const saved = data?.entries.find(item => item.id === currentId)
	const dirty = Boolean(
		draft &&
			saved &&
			(draft.title !== saved.title ||
				draft.summary !== saved.summary ||
				draft.body !== saved.body ||
				draft.section_id !== saved.section_id ||
				draft.position !== saved.position)
	)
	const unpublished = Boolean(
		draft?.published &&
			(draft.title !== draft.public_title ||
				draft.summary !== draft.public_summary ||
				draft.body !== draft.public_body ||
				draft.section_id !== draft.public_section_id ||
				draft.position !== draft.public_position)
	)

	useEffect(() => {
		if (!dirty) return
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			event.returnValue = ''
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty])

	async function refresh() {
		const response = await fetch('/api/manage/data', { cache: 'no-store' })
		if (!response.ok) throw new Error('无法读取管理数据')
		const next = (await response.json()) as Data
		setData(next)
		setSiteForm(next.settings)
		if (currentId !== null) setDraft(next.entries.find(item => item.id === currentId) || null)
	}

	useEffect(() => {
		refresh().catch(cause => setError((cause as Error).message))
	}, [])

	async function run(name: string, payload: Record<string, unknown>, message: string) {
		if (
			busy ||
			(dirty && !['save-entry', 'restore-entry', 'delete-entry'].includes(name) && !confirm('当前文档有未保存的修改，继续操作会丢失这些修改。确定继续吗？'))
		)
			return null
		setError('')
		setBusy(true)
		try {
			const result = await action(name, payload)
			await refresh()
			setNotice(message)
			router.refresh()
			return result
		} catch (cause) {
			setError((cause as Error).message)
			return null
		} finally {
			setBusy(false)
		}
	}

	function choose(item: Entry) {
		if (item.id === currentId) return
		if (busy || (dirty && !confirm('当前文档有未保存的修改，确定切换吗？'))) return
		setCurrentId(item.id)
		setDraft({ ...item })
		setViewMode('edit')
	}
	function change<K extends keyof Entry>(key: K, value: Entry[K]) {
		if (draft) setDraft({ ...draft, [key]: value })
	}

	async function upload(file: File, setUrl: (url: string) => void) {
		const form = new FormData()
		form.append('file', file)
		setBusy(true)
		try {
			const response = await fetch('/api/manage/upload', { method: 'POST', body: form })
			const result = await response.json()
			if (!response.ok) throw new Error(result.error)
			setUrl(result.url)
			setNotice('图片已上传')
		} catch (cause) {
			setError((cause as Error).message)
		} finally {
			setBusy(false)
		}
	}

	async function publishDraft() {
		if (!draft) return
		setError('')
		setBusy(true)
		try {
			await action('save-entry', {
				id: draft.id,
				section_id: draft.section_id,
				title: draft.title,
				summary: draft.summary,
				body: draft.body,
				position: draft.position
			})
			await action('publish-entry', { id: draft.id })
			await refresh()
			setNotice('发布成功，公开页面已更新')
			router.refresh()
		} catch (cause) {
			setError((cause as Error).message)
		} finally {
			setBusy(false)
		}
	}

	if (!data) return <p>正在加载后台…</p>
	return (
		<>
			<div className='docs-admin-head'>
				<div>
					<p className='docs-admin-kicker'>站点控制台</p>
					<h1>内容管理</h1>
					<p className='docs-admin-description'>在这里编写、发布和整理站点内容。</p>
				</div>
				<button
					className='docs-logout'
					onClick={async () => {
						if (dirty && !confirm('当前文档有未保存的修改，确定退出吗？')) return
						await action('logout')
						router.refresh()
					}}>
					<LogOut size={16} /> 退出登录
				</button>
			</div>
			<div className='docs-tabs' aria-label='管理功能'>
				<button className={tab === 'content' ? 'active' : ''} aria-pressed={tab === 'content'} onClick={() => setTab('content')}>
					<BookOpenText size={17} /> 文档与文章
				</button>
				<button className={tab === 'sections' ? 'active' : ''} aria-pressed={tab === 'sections'} onClick={() => setTab('sections')}>
					<Layers3 size={17} /> 栏目
				</button>
				<button className={tab === 'settings' ? 'active' : ''} aria-pressed={tab === 'settings'} onClick={() => setTab('settings')}>
					<Settings2 size={17} /> 站点设置
				</button>
				<button className={tab === 'backup' ? 'active' : ''} aria-pressed={tab === 'backup'} onClick={() => setTab('backup')}>
					<DatabaseBackup size={17} /> 备份恢复
				</button>
			</div>
			{error && (
				<p className='docs-error' role='alert'>
					{error}
				</p>
			)}
			{notice && (
				<p className='docs-notice' role='status'>
					{notice}
				</p>
			)}
			{tab === 'content' && (
				<div className='docs-admin-columns'>
					<aside className='docs-panel'>
						<h2>内容</h2>
						<p>先选栏目，再创建文档。</p>
						<select id='new-section' aria-label='新内容所属栏目'>
							{data.sections.map(section => (
								<option key={section.id} value={section.id}>
									{section.parent_id ? '　↳ ' : ''}
									{section.name}
								</option>
							))}
						</select>
						<button
							onClick={async () => {
								const section_id = Number((document.getElementById('new-section') as HTMLSelectElement).value)
								const id = await run('create-entry', { section_id, title: '未命名文档' }, '草稿已创建')
								if (id) {
									const response = await fetch('/api/manage/data')
									const next = (await response.json()) as Data
									setData(next)
									setCurrentId(Number(id))
									setDraft(next.entries.find(item => item.id === Number(id)) || null)
									setViewMode('edit')
								}
							}}>
							新建草稿
						</button>
						<div className='docs-admin-list'>
							{data.entries.map(item => (
								<button className={item.id === currentId ? 'active' : ''} key={item.id} onClick={() => choose(item)} disabled={busy}>
									{item.title}
									<small>{item.published ? '已发布' : '草稿'}</small>
								</button>
							))}
						</div>
					</aside>
					<section className='docs-panel docs-editor'>
						{draft ? (
							<>
								<div className='docs-editor-status'>
									<div>
										<strong>{draft.title || '未命名文档'}</strong>
										<span>
											{dirty
												? '有未保存的修改'
												: unpublished
													? '草稿已保存，尚未发布'
													: draft.published
														? '当前版本已发布'
														: draft.public_title
															? '已撤回公开版本'
															: '草稿已保存'}
										</span>
									</div>
									{draft.published ? (
										<a href={`/docs/${draft.id}`} target='_blank' rel='noreferrer'>
											查看公开页面 ↗
										</a>
									) : null}
								</div>
								<div className='docs-view-switch' aria-label='编辑视图'>
									<button className={viewMode === 'edit' ? 'active' : ''} aria-pressed={viewMode === 'edit'} onClick={() => setViewMode('edit')}>
										编辑
									</button>
									<button className={viewMode === 'split' ? 'active' : ''} aria-pressed={viewMode === 'split'} onClick={() => setViewMode('split')}>
										分屏预览
									</button>
									<button className={viewMode === 'preview' ? 'active' : ''} aria-pressed={viewMode === 'preview'} onClick={() => setViewMode('preview')}>
										预览
									</button>
								</div>
								<div className='docs-editor-actions'>
									<button
										disabled={busy || !dirty}
										onClick={() =>
											run(
												'save-entry',
												{ id: draft.id, section_id: draft.section_id, title: draft.title, summary: draft.summary, body: draft.body, position: draft.position },
												'草稿已保存；公开版本未改变'
											)
										}>
										保存草稿
									</button>
									<button className='docs-action-primary' disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={publishDraft}>
										{busy ? '处理中…' : '发布草稿'}
									</button>
									<button disabled={busy || !draft.published} onClick={() => run('withdraw-entry', { id: draft.id }, '已撤回')}>
										撤回
									</button>
									<button
										disabled={busy || !draft.previous_title}
										onClick={() => {
											if (confirm('恢复上一次发布版本？当前公开版本和未保存修改将被替换。')) run('restore-entry', { id: draft.id }, '已恢复上一次发布版本')
										}}>
										恢复上次发布
									</button>
									<button
										className='danger'
										disabled={busy}
										onClick={async () => {
											if (confirm('永久删除这篇文档？')) {
												if ((await run('delete-entry', { id: draft.id }, '已删除')) !== null) {
													setDraft(null)
													setCurrentId(null)
												}
											}
										}}>
										删除
									</button>
								</div>
								<div className={`docs-editor-body ${viewMode === 'split' ? 'split' : ''}`}>
									{viewMode !== 'preview' && (
										<div className='docs-editor-fields'>
											<label>
												标题
												<input value={draft.title} onChange={event => change('title', event.target.value)} />
											</label>
											<label>
												摘要
												<textarea rows={2} value={draft.summary} onChange={event => change('summary', event.target.value)} />
											</label>
											<div className='docs-inline'>
												<label>
													栏目
													<select value={draft.section_id} onChange={event => change('section_id', Number(event.target.value))}>
														{data.sections.map(section => (
															<option key={section.id} value={section.id}>
																{section.parent_id ? '　↳ ' : ''}
																{section.name}
															</option>
														))}
													</select>
												</label>
												<label>
													顺序
													<input type='number' min='0' value={draft.position} onChange={event => change('position', Number(event.target.value))} />
												</label>
											</div>
											<label>
												Markdown 正文
												<textarea
													className='docs-markdown-input'
													value={draft.body}
													onChange={event => change('body', event.target.value)}
													placeholder='从 # 标题 开始编写。支持 Markdown 图片和代码块。'
												/>
											</label>
											<label className='docs-upload'>
												上传并插入图片
												<input
													type='file'
													accept='image/png,image/jpeg,image/webp,image/gif'
													onChange={event => {
														const file = event.target.files?.[0]
														if (file)
															upload(file, url => setDraft(current => (current ? { ...current, body: `${current.body}\n![${file.name}](${url})\n` } : current)))
													}}
												/>
											</label>
											<p className='docs-markdown-help'>支持标题、列表、表格、任务列表、图片、代码块与公式。右侧预览和公开页面使用同一套渲染器。</p>
										</div>
									)}
									{viewMode !== 'edit' && (
										<div className='docs-editor-preview'>
											<p>草稿预览 · 仅管理员可见</p>
											<h2>{draft.title}</h2>
											<DocsMarkdown body={draft.body} />
										</div>
									)}
								</div>
							</>
						) : (
							<p className='docs-empty'>选择一篇内容，或新建草稿。</p>
						)}
					</section>
				</div>
			)}
			{tab === 'sections' && (
				<div className='docs-admin-columns'>
					<section className='docs-panel'>
						<h2>创建栏目</h2>
						<label>
							名称
							<input value={sectionForm.name} onChange={event => setSectionForm({ ...sectionForm, name: event.target.value })} />
						</label>
						<label>
							类型
							<select value={sectionForm.kind} onChange={event => setSectionForm({ ...sectionForm, kind: event.target.value, parent_id: '' })}>
								<option value='docs'>文档</option>
								<option value='articles'>文章</option>
							</select>
						</label>
						{sectionForm.kind === 'docs' && (
							<label>
								上级栏目
								<select value={sectionForm.parent_id} onChange={event => setSectionForm({ ...sectionForm, parent_id: event.target.value })}>
									<option value=''>顶级栏目</option>
									{data.sections
										.filter(item => item.kind === 'docs' && item.parent_id === null)
										.map(item => (
											<option key={item.id} value={item.id}>
												{item.name}
											</option>
										))}
								</select>
							</label>
						)}
						<button
							onClick={() =>
								run(
									'create-section',
									{ name: sectionForm.name, kind: sectionForm.kind, parent_id: sectionForm.parent_id ? Number(sectionForm.parent_id) : null },
									'栏目已创建'
								)
							}>
							创建
						</button>
					</section>
					<section className='docs-panel'>
						<h2>编辑栏目</h2>
						{data.sections.map(item => (
							<SectionRow key={item.id} item={item} sections={data.sections} run={run} />
						))}
					</section>
				</div>
			)}
			{tab === 'settings' && (
				<section className='docs-panel docs-settings'>
					<h2>站点设置</h2>
					{(
						[
							['name', '网站名称'],
							['logo', 'Logo URL'],
							['intro', '首页介绍'],
							['consoleUrl', '控制台 URL'],
							['apiKeyUrl', '获取 API Key URL']
						] as const
					).map(([key, label]) => (
						<label key={key}>
							{label}
							<input value={siteForm[key] || ''} onChange={event => setSiteForm({ ...siteForm, [key]: event.target.value })} />
						</label>
					))}
					<label className='docs-upload'>
						上传 Logo
						<input
							type='file'
							accept='image/png,image/jpeg,image/webp,image/gif'
							onChange={event => {
								const file = event.target.files?.[0]
								if (file) upload(file, url => setSiteForm({ ...siteForm, logo: url }))
							}}
						/>
					</label>
					<button onClick={() => run('save-settings', siteForm, '站点设置已保存')}>保存设置</button>
				</section>
			)}
			{tab === 'backup' && (
				<section className='docs-panel docs-settings'>
					<h2>备份与恢复</h2>
					<p>备份包含栏目、文档、站点设置和上传图片。恢复会覆盖当前全部内容与图片。</p>
					<a className='docs-button' href='/api/manage/backup' download>
						导出备份
					</a>
					<label>
						选择备份 JSON 文件
						<input
							type='file'
							accept='application/json,.json'
							onChange={async event => {
								const file = event.target.files?.[0]
								if (!file) return
								if (file.size > 100 * 1024 * 1024) {
									setError('备份文件过大')
									return
								}
								if (!confirm('恢复将覆盖当前所有栏目、文档、站点设置和上传图片。确定继续？')) return
								try {
									await action('restore-backup', { confirm: '覆盖全部数据', backup: JSON.parse(await file.text()) })
									await refresh()
									setNotice('备份已恢复')
								} catch (cause) {
									setError((cause as Error).message)
								}
							}}
						/>
					</label>
				</section>
			)}
		</>
	)
}

function SectionRow({
	item,
	sections,
	run
}: {
	item: Section
	sections: Section[]
	run: (name: string, payload: Record<string, unknown>, message: string) => Promise<unknown>
}) {
	const [name, setName] = useState(item.name)
	const [parent, setParent] = useState(item.parent_id || 0)
	const [position, setPosition] = useState(item.position)
	return (
		<div className='docs-section-row'>
			<input aria-label='栏目名称' value={name} onChange={event => setName(event.target.value)} />
			<select aria-label='上级栏目' value={parent} onChange={event => setParent(Number(event.target.value))} disabled={item.kind === 'articles'}>
				<option value={0}>顶级</option>
				{sections
					.filter(other => other.kind === 'docs' && other.parent_id === null && other.id !== item.id)
					.map(other => (
						<option key={other.id} value={other.id}>
							{other.name}
						</option>
					))}
			</select>
			<input aria-label='排序' type='number' min='0' value={position} onChange={event => setPosition(Number(event.target.value))} />
			<button onClick={() => run('update-section', { id: item.id, name, parent_id: parent || null, position }, '栏目已保存')}>保存</button>
			<button
				className='danger'
				onClick={() => {
					if (confirm(`删除栏目「${item.name}」？非空栏目不能删除。`)) run('delete-section', { id: item.id }, '栏目已删除')
				}}>
				删除
			</button>
		</div>
	)
}
