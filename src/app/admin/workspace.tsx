'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import clsx from 'clsx'
import {
	ArrowDownToLine,
	ArrowUpRight,
	BookOpenText,
	Check,
	CheckCircle2,
	ChevronDown,
	CircleAlert,
	Cloud,
	DatabaseBackup,
	FilePlus2,
	FileText,
	Focus,
	LayoutPanelLeft,
	LoaderCircle,
	LogOut,
	Menu,
	Monitor,
	MoreHorizontal,
	PencilLine,
	RotateCcw,
	Save,
	Search,
	Settings2,
	Sparkles,
	Trash2,
	Upload,
	X
} from 'lucide-react'
import type { Entry, Section } from '@/lib/site-db'
import { draftFields, reconcileEntry, reconcileSavedEntry, recoverDraft, sameDraft, type DraftFields } from '@/lib/admin-draft'
import { DialogModal } from '@/components/dialog-modal'

export type AdminData = { sections: Section[]; entries: Entry[]; settings: Record<string, string> }
type ViewMode = 'edit' | 'split' | 'preview'
type Panel = 'content' | 'settings' | 'backup'
type Confirmation = { title: string; description: string; label: string; run: () => Promise<void> }

const MarkdownEditor = dynamic(() => import('./markdown-editor'), {
	ssr: false,
	loading: () => (
		<div className='admin-loading'>
			<LoaderCircle size={24} className='admin-spin' />
			正在准备编辑器…
		</div>
	)
})
const MarkdownPreview = dynamic(() => import('./markdown-preview'), { ssr: false, loading: () => <div className='admin-loading'>正在准备预览…</div> })
const panels = [
	{ id: 'content', label: '内容管理', icon: BookOpenText },
	{ id: 'settings', label: '站点设置', icon: Settings2 },
	{ id: 'backup', label: '备份恢复', icon: DatabaseBackup }
] as const
const cacheKey = (id: number) => `chream-admin-draft-${id}`

async function action(name: string, payload: Record<string, unknown> = {}) {
	const response = await fetch(`/api/manage/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(
		() => {
			throw new Error('网络连接失败，请检查连接后重试。')
		}
	)
	const result = await response.json()
	if (!response.ok) throw new Error(result.error || '操作未完成，请重试')
	return result.result
}

function clearRecovery(id: number) {
	try {
		sessionStorage.removeItem(cacheKey(id))
	} catch {}
}

function publicPath(entry: Entry, sections: Section[]) {
	const name = sections.find(section => section.id === (entry.public_section_id ?? entry.section_id))?.name
	return name === 'API 文档' ? '/api-docs' : name === '使用教程' ? '/tutorials' : `/articles/${entry.id}`
}

export function AdminLogin({ logo = '/images/avatar.png' }: { logo?: string }) {
	const router = useRouter()
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [pending, setPending] = useState(false)
	async function submit(event: FormEvent) {
		event.preventDefault()
		if (pending) return
		setError('')
		setPending(true)
		try {
			await action('login', { username, password })
			const next = new URLSearchParams(window.location.search).get('next')
			if (next?.startsWith('/') && !next.startsWith('//')) window.location.assign(next)
			else router.refresh()
		} catch (cause) {
			setError((cause as Error).message)
			setPending(false)
		}
	}
	return (
		<div className='admin-login-layout'>
			<section className='admin-login-welcome'>
				<span className='admin-eyebrow'>
					<Sparkles size={16} />
					你的创作空间
				</span>
				<h1>
					把想法，
					<br />
					写成下一篇好文章。
				</h1>
				<p>熟悉的配色，更专注的工作台。整理文档、记录经验，让每一次写作都轻松一点。</p>
				<div className='admin-login-features'>
					<span>
						<PencilLine size={18} />
						Markdown 写作
					</span>
					<span>
						<Cloud size={18} />
						草稿与发布分开
					</span>
					<span>
						<LayoutPanelLeft size={18} />
						即写即看
					</span>
				</div>
			</section>
			<form className='admin-surface admin-login-card' onSubmit={submit}>
				<img src={logo} alt='' className='admin-login-avatar' />
				<span className='admin-eyebrow'>WELCOME BACK</span>
				<h2>欢迎回来</h2>
				<p>登录后，继续你的创作。</p>
				<label>
					账号
					<input value={username} onChange={event => setUsername(event.target.value)} autoComplete='username' placeholder='管理员账号' required />
				</label>
				<label>
					密码
					<input
						type='password'
						value={password}
						onChange={event => setPassword(event.target.value)}
						autoComplete='current-password'
						placeholder='输入密码'
						required
					/>
				</label>
				{error && (
					<p className='admin-error' role='alert'>
						<CircleAlert size={18} />
						{error}
					</p>
				)}
				<button className='admin-button primary' type='submit' disabled={pending}>
					{pending ? <LoaderCircle className='admin-spin' size={18} /> : <ArrowUpRight size={18} />}
					{pending ? '正在登录…' : '进入工作台'}
				</button>
			</form>
		</div>
	)
}

export function AdminWorkspace({ initialData, writerOnly = false }: { initialData: AdminData; writerOnly?: boolean }) {
	const router = useRouter()
	const reducedMotion = useReducedMotion()
	const [data, setData] = useState(initialData)
	const [draft, setDraft] = useState<Entry | null>(() => (initialData.entries[0] ? { ...initialData.entries[0] } : null))
	const dataRef = useRef(data)
	const draftRef = useRef(draft)
	const saveTask = useRef<Promise<boolean> | null>(null)
	const operation = useRef(false)
	const navigation = useRef(0)
	const recoveryReady = useRef(false)
	const [tab, setTab] = useState<Panel>('content')
	const [viewMode, setViewMode] = useState<ViewMode>('edit')
	const [previewBody, setPreviewBody] = useState(draft?.body || '')
	const [focused, setFocused] = useState(false)
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [filter, setFilter] = useState('all')
	const [newSectionId, setNewSectionId] = useState(initialData.sections.find(section => section.name === 'AI 技术分享')?.id ?? initialData.sections[0]?.id)
	const [siteForm, setSiteForm] = useState(initialData.settings)
	const [busy, setBusy] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState('')
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [lastSaved, setLastSaved] = useState('')
	const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
	const confirmationRoot = useRef<HTMLDivElement>(null)
	const saved = data.entries.find(item => item.id === draft?.id)
	const dirty = Boolean(draft && !sameDraft(draft, saved))
	const unpublished = Boolean(
		draft?.published &&
			(draft.title !== draft.public_title ||
				draft.summary !== draft.public_summary ||
				draft.body !== draft.public_body ||
				draft.section_id !== draft.public_section_id ||
				draft.position !== draft.public_position)
	)
	const section = data.sections.find(item => item.id === newSectionId) || data.sections[0]
	const sectionFull = Boolean(
		section &&
			['API 文档', '使用教程'].includes(section.name) &&
			data.entries.some(item => item.section_id === section.id || (item.published && item.public_section_id === section.id))
	)
	const visibleEntries = data.entries.filter(
		item => (filter === 'all' || item.section_id === Number(filter)) && item.title.toLowerCase().includes(query.trim().toLowerCase())
	)

	const setCurrentDraft = useCallback((entry: Entry | null) => {
		draftRef.current = entry
		setDraft(entry)
		setPreviewBody(entry?.body || '')
		try {
			if (entry) sessionStorage.setItem('chream-admin-selected', String(entry.id))
		} catch {}
	}, [])
	const editDraft = useCallback((changes: Partial<DraftFields>) => {
		if (!draftRef.current) return
		const next = { ...draftRef.current, ...changes }
		draftRef.current = next
		setDraft(next)
		setSaveError('')
		setNotice('')
	}, [])
	const changeBody = useCallback((body: string) => editDraft({ body }), [editDraft])

	const saveCurrent = useCallback(async () => {
		if (operation.current) return false
		while (saveTask.current) if (!(await saveTask.current)) return false
		if (operation.current) return false
		const current = draftRef.current
		const baseline = dataRef.current.entries.find(item => item.id === current?.id)
		if (!current || sameDraft(current, baseline)) return true
		if (!current.title.trim()) {
			setSaveError('填写标题后即可保存，当前文字仍保留在编辑器中。')
			return false
		}
		const snapshot = draftFields(current)
		setSaving(true)
		setSaveError('')
		const task = (async () => {
			try {
				const stored = (await action('save-entry', snapshot)) as Entry
				const next = { ...dataRef.current, entries: dataRef.current.entries.map(item => (item.id === snapshot.id ? stored : item)) }
				dataRef.current = next
				setData(next)
				if (draftRef.current?.id === snapshot.id) setCurrentDraft(reconcileSavedEntry(draftRef.current, snapshot, stored))
				if (sameDraft(draftRef.current, stored)) clearRecovery(snapshot.id)
				setLastSaved(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
				return true
			} catch (cause) {
				setSaveError((cause as Error).message)
				return false
			} finally {
				saveTask.current = null
				setSaving(false)
			}
		})()
		saveTask.current = task
		return task
	}, [setCurrentDraft])

	async function flushDraft() {
		while (
			draftRef.current &&
			!sameDraft(
				draftRef.current,
				dataRef.current.entries.find(item => item.id === draftRef.current?.id)
			)
		) {
			if (!(await saveCurrent())) return false
		}
		return true
	}

	const loadData = useCallback(
		async (replaceDraft = false, selectedId?: number) => {
			const response = await fetch('/api/manage/data', { cache: 'no-store' })
			if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录。' : '无法读取内容，请重试。')
			const next = (await response.json()) as AdminData
			dataRef.current = next
			setData(next)
			setSiteForm(next.settings)
			const current = draftRef.current
			const target = next.entries.find(item => item.id === (selectedId ?? current?.id)) || next.entries[0] || null
			setCurrentDraft(target ? (!replaceDraft && current?.id === target.id ? reconcileEntry(current, target) : { ...target }) : null)
			return next
		},
		[setCurrentDraft]
	)

	useEffect(() => {
		const timer = window.setTimeout(() => setPreviewBody(draft?.body || ''), 220)
		return () => window.clearTimeout(timer)
	}, [draft?.body])
	useEffect(() => {
		if (!recoveryReady.current || !draft || !saved) return
		try {
			if (dirty) sessionStorage.setItem(cacheKey(draft.id), JSON.stringify({ base: draftFields(saved), draft: draftFields(draft) }))
			else clearRecovery(draft.id)
		} catch {}
	}, [draft, saved, dirty])
	useEffect(() => {
		if (!recoveryReady.current) {
			recoveryReady.current = true
			try {
				const id = Number(sessionStorage.getItem('chream-admin-selected'))
				const entry = initialData.entries.find(item => item.id === id) || initialData.entries[0]
				if (entry) {
					const raw = sessionStorage.getItem(cacheKey(entry.id))
					const recovered = raw ? recoverDraft(entry, JSON.parse(raw)) : null
					setCurrentDraft(recovered || { ...entry })
					if (recovered) setNotice('已恢复此标签页未保存的草稿。')
				}
			} catch {}
		}
		const media = window.matchMedia('(min-width: 1100px)')
		if (media.matches) setViewMode('split')
		const resize = () => {
			if (!media.matches) setViewMode(current => (current === 'split' ? 'edit' : current))
		}
		media.addEventListener('change', resize)
		return () => media.removeEventListener('change', resize)
	}, [setCurrentDraft])
	useEffect(() => {
		if (!dirty || saving || busy || saveError || !draft?.title.trim()) return
		const timer = window.setTimeout(() => {
			void saveCurrent()
		}, 1200)
		return () => window.clearTimeout(timer)
	}, [dirty, draft, saving, busy, saveError, saveCurrent])
	useEffect(() => {
		if (!dirty) return
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			event.returnValue = ''
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty])
	useEffect(() => {
		const keyboard = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
				event.preventDefault()
				void saveCurrent()
			}
			if (event.key === 'Escape' && !confirmation) setFocused(false)
		}
		window.addEventListener('keydown', keyboard)
		return () => window.removeEventListener('keydown', keyboard)
	}, [saveCurrent, confirmation])
	useEffect(() => {
		if (!confirmation) return
		const previous = document.activeElement as HTMLElement | null
		const dialog = confirmationRoot.current
		dialog?.querySelector<HTMLButtonElement>('button')?.focus()
		const keepFocus = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') return
			const buttons = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
			const target = event.shiftKey ? buttons.at(-1) : buttons[0]
			if (!buttons.length || document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) {
				event.preventDefault()
				target?.focus()
			}
		}
		window.addEventListener('keydown', keepFocus)
		return () => {
			window.removeEventListener('keydown', keepFocus)
			previous?.focus()
		}
	}, [confirmation])

	async function choose(entry: Entry) {
		if (operation.current || entry.id === draftRef.current?.id) {
			setSidebarOpen(false)
			return
		}
		const token = ++navigation.current
		if (!(await flushDraft()) || token !== navigation.current) return
		try {
			const raw = sessionStorage.getItem(cacheKey(entry.id))
			setCurrentDraft(raw ? recoverDraft(entry, JSON.parse(raw)) || { ...entry } : { ...entry })
			sessionStorage.setItem('chream-admin-selected', String(entry.id))
		} catch {
			setCurrentDraft({ ...entry })
		}
		setError('')
		setSaveError('')
		setNotice('')
		setSidebarOpen(false)
	}
	async function switchPanel(next: Panel) {
		if (operation.current || !(await flushDraft())) return
		setTab(next)
		setFocused(false)
		setSidebarOpen(false)
		setError('')
		setNotice('')
	}
	async function perform(name: string, task: () => Promise<void>) {
		if (operation.current) return
		operation.current = true
		setBusy(name)
		setError('')
		try {
			if (saveTask.current) await saveTask.current
			await task()
		} catch (cause) {
			setError((cause as Error).message)
		} finally {
			operation.current = false
			setBusy(null)
		}
	}
	async function createDraft() {
		if (sectionFull || !section || !(await flushDraft())) return
		await perform('create', async () => {
			const id = Number(await action('create-entry', { section_id: section.id, title: '未命名文章' }))
			await loadData(true, id)
			setFilter('all')
			setQuery('')
			setSidebarOpen(false)
			setNotice('新草稿已准备好。')
		})
	}
	async function publishDraft() {
		if (operation.current || !(await flushDraft())) return
		const current = draftRef.current
		if (!current?.body.trim() || !current.title.trim()) {
			setError('请先填写标题和正文。')
			return
		}
		await perform('publish', async () => {
			await action('publish-entry', { id: current.id })
			await loadData()
			setNotice('已发布，公开页面立即生效。')
		})
	}
	async function uploadFile(file: File) {
		if (operation.current) throw new Error('请等待当前操作完成')
		operation.current = true
		setBusy('upload')
		setError('')
		try {
			const form = new FormData()
			form.append('file', file)
			const response = await fetch('/api/manage/upload', { method: 'POST', body: form })
			const result = await response.json()
			if (!response.ok) throw new Error(result.error || '图片上传失败')
			return result.url as string
		} catch (cause) {
			setError((cause as Error).message)
			throw cause
		} finally {
			operation.current = false
			setBusy(null)
		}
	}
	function documentAction(kind: 'withdraw-entry' | 'restore-entry' | 'delete-entry') {
		if (!draft) return
		const entry = draft
		const copy = {
			'withdraw-entry': { title: '撤回公开文章？', description: '公开页面和搜索将隐藏这篇内容，草稿会继续保留。', label: '确认撤回' },
			'restore-entry': { title: '恢复上一次发布？', description: '当前正文和公开版本会被上一次发布替换。当前未保存的修改也会被替换。', label: '确认恢复' },
			'delete-entry': { title: '删除这篇内容？', description: `「${entry.title}」将永久删除。请先确认已经备份需要保留的内容。`, label: '确认删除' }
		}
		setConfirmation({
			...copy[kind],
			run: async () => {
				if (kind === 'withdraw-entry' && !(await flushDraft())) return
				await perform(kind, async () => {
					await action(kind, { id: entry.id })
					clearRecovery(entry.id)
					await loadData(kind !== 'withdraw-entry')
					setNotice(kind === 'delete-entry' ? '内容已删除。' : kind === 'withdraw-entry' ? '已撤回，草稿已保留。' : '已恢复上一次发布版本。')
				})
			}
		})
	}
	async function logout() {
		if (!(await flushDraft())) return
		await perform('logout', async () => {
			await action('logout')
			router.refresh()
		})
	}
	async function restoreBackup(file: File) {
		if (file.size > 100 * 1024 * 1024) {
			setError('备份文件不能超过 100MB。')
			return
		}
		let backup: unknown
		try {
			backup = JSON.parse(await file.text())
		} catch {
			setError('这个文件不是有效的 JSON 备份。')
			return
		}
		setConfirmation({
			title: '恢复备份并覆盖当前数据？',
			description: `将使用「${file.name}」替换全部文档、站点设置和上传图片。建议先导出当前备份。`,
			label: '确认覆盖并恢复',
			run: async () => {
				await perform('restore', async () => {
					await action('restore-backup', { confirm: '覆盖全部数据', backup })
					for (const item of dataRef.current.entries) clearRecovery(item.id)
					await loadData(true)
					setSaveError('')
					setNotice('备份恢复完成。')
					router.refresh()
				})
			}
		})
	}

	return (
		<div className={clsx('admin-workspace', focused && 'is-focused')}>
			<div className='admin-workspace-heading'>
				<div>
					<span className='admin-eyebrow'>
						<Sparkles size={15} />
						{writerOnly ? '开始一次新的记录' : '你的内容，井然有序'}
					</span>
					<h1>创作工作台</h1>
					<p>写下想法，预览成文，再把准备好的内容分享出去。</p>
				</div>
				<button type='button' className='admin-button quiet' disabled={Boolean(busy)} onClick={() => void logout()}>
					<LogOut size={17} />
					退出登录
				</button>
			</div>
			<nav className='admin-workspace-nav' aria-label='管理功能'>
				{panels.map(panel => (
					<button
						type='button'
						key={panel.id}
						aria-pressed={tab === panel.id}
						onClick={() => void switchPanel(panel.id)}
						className={clsx(tab === panel.id && 'active')}
						disabled={Boolean(busy)}>
						{tab === panel.id && (
							<motion.span className='admin-nav-indicator' layoutId='admin-panel-active' transition={{ duration: reducedMotion ? 0 : 0.18 }} />
						)}
						<panel.icon size={18} />
						<span>{panel.label}</span>
					</button>
				))}
				<span className='admin-content-count'>{data.entries.length} 篇内容</span>
			</nav>
			{error && (
				<div className='admin-feedback error' role='alert'>
					<CircleAlert size={18} />
					<span>{error}</span>
					<button type='button' aria-label='关闭错误提示' onClick={() => setError('')}>
						<X size={16} />
					</button>
				</div>
			)}
			{notice && (
				<div className='admin-feedback success' role='status'>
					<CheckCircle2 size={18} />
					<span>{notice}</span>
					<button type='button' aria-label='关闭提示' onClick={() => setNotice('')}>
						<X size={16} />
					</button>
				</div>
			)}
			<section className='admin-content-panel' hidden={tab !== 'content'} aria-label='内容编辑工作台'>
				<div className={clsx('admin-writing-grid', focused && 'focused')}>
					<aside className={clsx('admin-surface admin-library', sidebarOpen && 'is-open')}>
						<div className='admin-library-title'>
							<div>
								<span className='admin-eyebrow'>LIBRARY</span>
								<h2>我的内容</h2>
							</div>
							<button className='admin-icon-button admin-library-close' type='button' aria-label='收起内容列表' onClick={() => setSidebarOpen(false)}>
								<X size={18} />
							</button>
						</div>
						<label className='admin-library-search'>
							<Search size={17} />
							<input aria-label='查找文章' placeholder='查找标题…' value={query} onChange={event => setQuery(event.target.value)} />
						</label>
						<select aria-label='筛选栏目' value={filter} onChange={event => setFilter(event.target.value)}>
							<option value='all'>全部栏目</option>
							{data.sections.map(item => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<div className='admin-library-list'>
							{visibleEntries.map(item => (
								<button
									type='button'
									key={item.id}
									aria-current={draft?.id === item.id ? 'true' : undefined}
									className={clsx('admin-document', draft?.id === item.id && 'active')}
									disabled={Boolean(busy)}
									onClick={() => void choose(item)}>
									<FileText size={18} />
									<span>
										<strong>{item.title}</strong>
										<small>{data.sections.find(section => section.id === item.section_id)?.name}</small>
									</span>
									<i className={clsx('admin-status-dot', item.published && 'published')} title={item.published ? '已发布' : '草稿'} />
								</button>
							))}
							{!visibleEntries.length && <p className='admin-empty-copy'>没有找到内容。试试其他关键词，或创建一篇新文章。</p>}
						</div>
						<div className='admin-library-create'>
							<label>
								新内容所属栏目
								<select value={section?.id} onChange={event => setNewSectionId(Number(event.target.value))} aria-label='新内容所属栏目'>
									{data.sections.map(item => (
										<option key={item.id} value={item.id}>
											{item.name}
										</option>
									))}
								</select>
							</label>
							<button type='button' className='admin-button primary' disabled={Boolean(busy) || sectionFull} onClick={() => void createDraft()}>
								<FilePlus2 size={18} />
								新建草稿
							</button>
							<small>{sectionFull ? '该栏目保留单篇，请选择已有内容继续编辑。' : '新内容先保存为草稿，发布后访客才会看到。'}</small>
						</div>
					</aside>
					<section className='admin-surface admin-composer'>
						{draft ? (
							<>
								<header className='admin-composer-actions'>
									<div className='admin-save-state'>
										<span className={clsx('admin-save-dot', dirty && 'pending', saveError && 'failed')} />
										{saving ? (
											<>
												<LoaderCircle size={15} className='admin-spin' />
												正在保存…
											</>
										) : saveError ? (
											'保存未完成'
										) : dirty ? (
											draft.title.trim() ? (
												'等待自动保存'
											) : (
												'请填写标题'
											)
										) : unpublished || !draft.published ? (
											'草稿已保存'
										) : (
											'当前版本已发布'
										)}
										{lastSaved && !dirty && <small>{lastSaved}</small>}
									</div>
									<div className='admin-primary-actions'>
										<button
											type='button'
											className='admin-button quiet'
											disabled={Boolean(busy) || saving || !dirty || !draft.title.trim()}
											onClick={() => void saveCurrent()}>
											<Save size={17} />
											保存草稿
										</button>
										<button
											type='button'
											className='admin-button primary'
											disabled={Boolean(busy) || !draft.title.trim() || !draft.body.trim()}
											onClick={() => void publishDraft()}>
											{busy === 'publish' ? <LoaderCircle size={18} className='admin-spin' /> : <ArrowUpRight size={18} />}
											{draft.published ? '更新发布' : '发布文章'}
										</button>
										<details className='admin-more-actions'>
											<summary aria-label='更多文章操作'>
												<MoreHorizontal size={20} />
											</summary>
											<div>
												<button type='button' disabled={Boolean(busy) || !draft.published} onClick={() => documentAction('withdraw-entry')}>
													<RotateCcw size={16} />
													撤回发布
												</button>
												<button type='button' disabled={Boolean(busy) || !draft.previous_title} onClick={() => documentAction('restore-entry')}>
													<RotateCcw size={16} />
													恢复上次发布
												</button>
												<button type='button' className='destructive' disabled={Boolean(busy)} onClick={() => documentAction('delete-entry')}>
													<Trash2 size={16} />
													删除内容
												</button>
											</div>
										</details>
									</div>
								</header>
								{saveError && (
									<div className='admin-feedback error' role='alert'>
										<CircleAlert size={17} />
										<span>{saveError} 当前输入仍保留。</span>
										<button type='button' className='admin-button quiet' onClick={() => void saveCurrent()}>
											重试保存
										</button>
									</div>
								)}
								<div className='admin-document-meta'>
									<div className='admin-document-heading'>
										<span className='admin-eyebrow'>
											{data.sections.find(item => item.id === draft.section_id)?.name} / {draft.published ? '已发布' : '草稿'}
										</span>
										<input
											className='admin-title-input'
											aria-label='文章标题'
											placeholder='为你的文章起一个名字…'
											value={draft.title}
											onChange={event => editDraft({ title: event.target.value })}
											disabled={Boolean(busy)}
										/>
									</div>
									<details className='admin-publish-details'>
										<summary>
											<Settings2 size={16} />
											摘要与发布信息
											<ChevronDown size={15} />
										</summary>
										<div>
											<label className='admin-summary-field'>
												摘要
												<textarea
													aria-label='文章摘要'
													rows={2}
													placeholder='用一两句话介绍这篇内容…'
													value={draft.summary}
													disabled={Boolean(busy)}
													onChange={event => editDraft({ summary: event.target.value })}
												/>
											</label>
											<label>
												栏目
												<select
													aria-label='文章栏目'
													value={draft.section_id}
													onChange={event => editDraft({ section_id: Number(event.target.value) })}
													disabled={Boolean(busy)}>
													{data.sections.map(item => (
														<option key={item.id} value={item.id}>
															{item.name}
														</option>
													))}
												</select>
											</label>
											<label>
												列表顺序
												<input
													aria-label='列表顺序'
													type='number'
													min='0'
													value={draft.position}
													disabled={Boolean(busy)}
													onChange={event => editDraft({ position: Number(event.target.value) })}
												/>
											</label>
										</div>
									</details>
								</div>
								<div className='admin-view-bar'>
									<div className='admin-view-tabs' aria-label='编辑视图'>
										<button
											type='button'
											aria-pressed={viewMode === 'edit'}
											className={clsx(viewMode === 'edit' && 'active')}
											onClick={() => setViewMode('edit')}>
											<PencilLine size={16} />
											编辑
										</button>
										<button
											type='button'
											className={clsx('admin-split-toggle', viewMode === 'split' && 'active')}
											aria-pressed={viewMode === 'split'}
											onClick={() => setViewMode('split')}>
											<LayoutPanelLeft size={16} />
											分屏
										</button>
										<button
											type='button'
											aria-pressed={viewMode === 'preview'}
											className={clsx(viewMode === 'preview' && 'active')}
											onClick={() => setViewMode('preview')}>
											<Monitor size={16} />
											预览
										</button>
									</div>
									<div className='admin-view-tools'>
										<button type='button' className='admin-icon-button admin-open-library' aria-label='打开内容列表' onClick={() => setSidebarOpen(true)}>
											<Menu size={18} />
										</button>
										<button
											type='button'
											className={clsx('admin-icon-button', focused && 'active')}
											aria-label={focused ? '退出专注模式' : '专注写作'}
											title={focused ? '退出专注模式' : '专注写作'}
											onClick={() => setFocused(value => !value)}>
											<Focus size={18} />
										</button>
										{draft.published && (
											<a
												className='admin-icon-button'
												aria-label='查看公开页面'
												title='查看公开页面'
												href={publicPath(draft, data.sections)}
												target='_blank'
												rel='noreferrer'>
												<ArrowUpRight size={18} />
											</a>
										)}
									</div>
								</div>
								<div className={clsx('admin-editor-panes', viewMode === 'split' && 'is-split')}>
									<div className='admin-source-pane' hidden={viewMode === 'preview'}>
										<MarkdownEditor
											documentId={draft.id}
											value={draft.body}
											active={tab === 'content' && viewMode !== 'preview'}
											disabled={Boolean(busy)}
											onChange={changeBody}
											onSave={() => void saveCurrent()}
											onPublish={() => void publishDraft()}
											onUpload={uploadFile}
										/>
									</div>
									{viewMode !== 'edit' && (
										<div className='admin-preview-pane'>
											<MarkdownPreview key={draft.id} body={previewBody} />
										</div>
									)}
								</div>
							</>
						) : (
							<div className='admin-composer-empty'>
								<div>
									<PencilLine size={32} />
								</div>
								<span className='admin-eyebrow'>A FRESH PAGE</span>
								<h2>从一个想法开始。</h2>
								<p>选择一篇现有文档，或新建草稿，开始你的下一次记录。</p>
								<button type='button' className='admin-button primary' onClick={() => setSidebarOpen(true)}>
									<FilePlus2 size={18} />
									浏览或新建内容
								</button>
							</div>
						)}
					</section>
				</div>
			</section>
			<section className='admin-surface admin-settings-panel' hidden={tab !== 'settings'}>
				<div className='admin-section-heading'>
					<span className='admin-eyebrow'>SITE SETTINGS</span>
					<h2>让网站更像你</h2>
					<p>这里的资料会同步到首页、导航和页面摘要。配色与卡片布局继续在首页设置中调整。</p>
				</div>
				<div className='admin-settings-grid'>
					{(
						[
							['name', '网站名称'],
							['username', '作者名称'],
							['intro', '站点介绍'],
							['logo', '头像 / Logo URL'],
							['githubUrl', 'GitHub 链接'],
							['email', '联系邮箱'],
							['juejinUrl', '掘金链接'],
							['analyticsId', 'Google Analytics ID（留空停用）'],
							['consoleUrl', '控制台 URL'],
							['apiKeyUrl', '获取 API Key URL']
						] as const
					).map(([key, label]) => (
						<label className={clsx(key === 'intro' && 'wide')} key={key}>
							{label}
							{key === 'intro' ? (
								<textarea
									rows={3}
									disabled={Boolean(busy)}
									value={siteForm[key] || ''}
									onChange={event => setSiteForm(current => ({ ...current, [key]: event.target.value }))}
								/>
							) : (
								<input
									disabled={Boolean(busy)}
									value={siteForm[key] || ''}
									onChange={event => setSiteForm(current => ({ ...current, [key]: event.target.value }))}
								/>
							)}
						</label>
					))}
				</div>
				<div className='admin-settings-footer'>
					<label className='admin-button quiet admin-file-button'>
						<Upload size={17} />
						上传头像
						<input
							type='file'
							accept='image/png,image/jpeg,image/webp,image/gif'
							disabled={Boolean(busy)}
							hidden
							onChange={event => {
								const file = event.target.files?.[0]
								if (file)
									void uploadFile(file)
										.then(url => setSiteForm(current => ({ ...current, logo: url })))
										.catch(() => {})
								event.target.value = ''
							}}
						/>
					</label>
					<button
						type='button'
						className='admin-button primary'
						disabled={Boolean(busy)}
						onClick={() =>
							void perform('settings', async () => {
								await action('save-settings', siteForm)
								await loadData()
								setNotice('站点设置已保存。')
								router.refresh()
							})
						}>
						<Check size={18} />
						保存站点设置
					</button>
				</div>
			</section>
			<section className='admin-surface admin-backup-panel' hidden={tab !== 'backup'}>
				<div className='admin-section-heading'>
					<span className='admin-eyebrow'>PEACE OF MIND</span>
					<h2>为你的内容留一份备份</h2>
					<p>包含文档、草稿、发布版本、站点设置和上传图片。建议在更新或恢复之前，先导出当前内容。</p>
				</div>
				<div className='admin-backup-grid'>
					<div>
						<div className='admin-backup-icon'>
							<ArrowDownToLine size={26} />
						</div>
						<h3>导出完整备份</h3>
						<p>下载 JSON 文件，保存到你信任的位置。</p>
						<a className='admin-button primary' href='/api/manage/backup' download>
							<ArrowDownToLine size={18} />
							下载备份
						</a>
					</div>
					<div>
						<div className='admin-backup-icon'>
							<Upload size={26} />
						</div>
						<h3>从备份恢复</h3>
						<p>恢复会覆盖当前内容。选择文件后，仍需要再次确认。</p>
						<label className='admin-button quiet admin-file-button'>
							<Upload size={18} />
							选择备份文件
							<input
								type='file'
								accept='application/json,.json'
								hidden
								disabled={Boolean(busy)}
								onChange={event => {
									const file = event.target.files?.[0]
									if (file) void restoreBackup(file)
									event.target.value = ''
								}}
							/>
						</label>
					</div>
				</div>
			</section>
			<DialogModal
				open={Boolean(confirmation)}
				onClose={() => {
					if (!busy) setConfirmation(null)
				}}
				className='admin-confirmation'
				disableCloseOnOverlay={Boolean(busy)}>
				<div ref={confirmationRoot} role='dialog' aria-modal='true' aria-label={confirmation?.title}>
					<span className='admin-confirmation-icon'>
						<CircleAlert size={24} />
					</span>
					<h2>{confirmation?.title}</h2>
					<p>{confirmation?.description}</p>
					<div>
						<button type='button' className='admin-button quiet' disabled={Boolean(busy)} onClick={() => setConfirmation(null)}>
							取消
						</button>
						<button
							type='button'
							className='admin-button danger'
							disabled={Boolean(busy)}
							onClick={async () => {
								if (!confirmation) return
								await confirmation.run()
								setConfirmation(null)
							}}>
							{busy ? <LoaderCircle className='admin-spin' size={18} /> : null}
							{confirmation?.label}
						</button>
					</div>
				</div>
			</DialogModal>
		</div>
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
