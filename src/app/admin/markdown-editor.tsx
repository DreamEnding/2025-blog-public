'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { basicSetup } from 'codemirror'
import { Annotation, Compartment, EditorState, Prec, Transaction } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { indentWithTab, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { openSearchPanel } from '@codemirror/search'
import { Bold, Code, CodeXml, Heading2, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Quote, Redo2, Search, Table2, Undo2 } from 'lucide-react'
import { markdownEdit, type MarkdownFormat } from '@/lib/markdown-edit'

type Props = {
	documentId: number
	value: string
	disabled?: boolean
	active: boolean
	onChange: (body: string) => void
	onSave: () => void
	onPublish: () => void
	onUpload: (file: File) => Promise<string>
}

const tools = [
	{ format: 'heading', icon: Heading2, label: '二级标题' },
	{ format: 'bold', icon: Bold, label: '粗体 · Ctrl+B' },
	{ format: 'italic', icon: Italic, label: '斜体 · Ctrl+I' },
	{ format: 'quote', icon: Quote, label: '引用' },
	{ format: 'bullet', icon: List, label: '无序列表' },
	{ format: 'ordered', icon: ListOrdered, label: '有序列表' },
	{ format: 'task', icon: ListChecks, label: '任务列表' },
	{ format: 'link', icon: Link2, label: '插入链接' },
	{ format: 'inline-code', icon: Code, label: '行内代码' },
	{ format: 'code', icon: CodeXml, label: '代码块' },
	{ format: 'table', icon: Table2, label: '表格' }
] as const

const externalUpdate = Annotation.define<boolean>()

function MarkdownEditor(props: Props) {
	const host = useRef<HTMLDivElement>(null)
	const editor = useRef<EditorView | null>(null)
	const callbacks = useRef(props)
	const readOnly = useRef(new Compartment())
	const fileInput = useRef<HTMLInputElement>(null)
	const [stats, setStats] = useState({ lines: 1, characters: props.value.length, undo: false, redo: false })

	useEffect(() => {
		callbacks.current = props
	}, [props])

	function format(kind: MarkdownFormat, view = editor.current) {
		if (!view || view.state.readOnly) return false
		const selection = view.state.selection.main
		const edit = markdownEdit(view.state.doc.toString(), selection.from, selection.to, kind)
		view.dispatch({ changes: { from: edit.from, to: edit.to, insert: edit.insert }, selection: edit.selection, annotations: Transaction.userEvent.of('input') })
		view.focus()
		return true
	}

	async function insertImage(file: File, view = editor.current) {
		if (!view || view.state.readOnly) return
		const marker = `![图片上传中-${Date.now()}]()`
		const selection = view.state.selection.main
		view.dispatch({ changes: { from: selection.from, to: selection.to, insert: marker }, selection: { anchor: selection.from + marker.length } })
		try {
			const url = await callbacks.current.onUpload(file)
			if (editor.current !== view) return
			const index = view.state.doc.toString().indexOf(marker)
			if (index >= 0)
				view.dispatch({
					changes: { from: index, to: index + marker.length, insert: `![${file.name.replace(/[\[\]]/g, '')}](${url})` },
					annotations: Transaction.addToHistory.of(false)
				})
		} catch {
			if (editor.current !== view) return
			const index = view.state.doc.toString().indexOf(marker)
			if (index >= 0) view.dispatch({ changes: { from: index, to: index + marker.length, insert: '' }, annotations: Transaction.addToHistory.of(false) })
		}
		view.focus()
	}

	useEffect(() => {
		if (!host.current) return
		const view = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: callbacks.current.value,
				extensions: [
					basicSetup,
					EditorState.phrases.of({
						Find: '查找',
						Replace: '替换',
						next: '下一个',
						previous: '上一个',
						all: '选中全部',
						'match case': '区分大小写',
						regexp: '正则表达式',
						'by word': '完整单词',
						replace: '替换',
						'replace all': '替换全部',
						close: '关闭',
						'Go to line': '跳转到行',
						go: '跳转',
						'current match': '当前匹配',
						'on line': '所在行',
						'replaced match on line $': '已替换第 $ 行匹配',
						'replaced $ matches': '已替换 $ 处匹配'
					}),
					markdown({ base: markdownLanguage }),
					EditorView.lineWrapping,
					placeholder('用 ## 标题组织想法，或从工具栏插入列表、代码和图片…'),
					EditorView.contentAttributes.of({ 'aria-label': 'Markdown 正文', 'aria-multiline': 'true', spellcheck: 'false' }),
					readOnly.current.of([EditorState.readOnly.of(Boolean(callbacks.current.disabled)), EditorView.editable.of(!callbacks.current.disabled)]),
					Prec.highest(
						keymap.of([
							{
								key: 'Mod-s',
								run: () => {
									callbacks.current.onSave()
									return true
								}
							},
							{
								key: 'Mod-Enter',
								run: () => {
									callbacks.current.onPublish()
									return true
								}
							},
							{ key: 'Mod-b', run: view => format('bold', view) },
							{ key: 'Mod-i', run: view => format('italic', view) },
							{ key: 'Mod-k', run: view => format('link', view) },
							indentWithTab
						])
					),
					EditorView.updateListener.of(update => {
						if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalUpdate)))
							callbacks.current.onChange(update.state.doc.toString())
						if (update.docChanged || update.transactions.length)
							setStats({
								lines: update.state.doc.lines,
								characters: update.state.doc.length,
								undo: undoDepth(update.state) > 0,
								redo: redoDepth(update.state) > 0
							})
					}),
					EditorView.domEventHandlers({
						paste(event, view) {
							const file = event.clipboardData?.files[0]
							if (!file?.type.startsWith('image/')) return false
							event.preventDefault()
							void insertImage(file, view)
							return true
						},
						drop(event, view) {
							const file = event.dataTransfer?.files[0]
							if (!file?.type.startsWith('image/')) return false
							event.preventDefault()
							const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
							if (position !== null) view.dispatch({ selection: { anchor: position } })
							void insertImage(file, view)
							return true
						}
					}),
					EditorView.theme({
						'&': { height: '100%', backgroundColor: 'transparent' },
						'.cm-scroller': { overflow: 'auto' },
						'&.cm-focused': { outline: 'none' }
					})
				]
			})
		})
		editor.current = view
		setStats({ lines: view.state.doc.lines, characters: view.state.doc.length, undo: false, redo: false })
		return () => {
			editor.current = null
			view.destroy()
		}
	}, [props.documentId])

	useEffect(() => {
		const view = editor.current
		if (view && view.state.doc.toString() !== props.value)
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: props.value },
				annotations: [Transaction.addToHistory.of(false), externalUpdate.of(true)]
			})
	}, [props.value])
	useEffect(() => {
		editor.current?.dispatch({
			effects: readOnly.current.reconfigure([EditorState.readOnly.of(Boolean(props.disabled)), EditorView.editable.of(!props.disabled)])
		})
	}, [props.disabled])
	useEffect(() => {
		if (props.active) editor.current?.requestMeasure()
	}, [props.active])

	return (
		<div className='admin-markdown-editor'>
			<div className='admin-format-toolbar' role='toolbar' aria-label='Markdown 格式工具'>
				<button
					type='button'
					aria-label='撤销'
					title='撤销 · Ctrl+Z'
					disabled={props.disabled || !stats.undo}
					onMouseDown={event => event.preventDefault()}
					onClick={() => {
						if (editor.current) {
							undo(editor.current)
							editor.current.focus()
						}
					}}>
					<Undo2 size={18} />
				</button>
				<button
					type='button'
					aria-label='重做'
					title='重做 · Ctrl+Shift+Z'
					disabled={props.disabled || !stats.redo}
					onMouseDown={event => event.preventDefault()}
					onClick={() => {
						if (editor.current) {
							redo(editor.current)
							editor.current.focus()
						}
					}}>
					<Redo2 size={18} />
				</button>
				<span className='admin-toolbar-divider' />
				{tools.map(tool => (
					<button
						type='button'
						key={tool.format}
						aria-label={tool.label}
						title={tool.label}
						disabled={props.disabled}
						onMouseDown={event => event.preventDefault()}
						onClick={() => format(tool.format)}>
						<tool.icon size={18} />
					</button>
				))}
				<button
					type='button'
					aria-label='上传图片'
					title='上传图片，也可粘贴或拖入'
					disabled={props.disabled}
					onMouseDown={event => event.preventDefault()}
					onClick={() => fileInput.current?.click()}>
					<ImagePlus size={18} />
				</button>
				<button
					type='button'
					aria-label='查找与替换'
					title='查找与替换 · Ctrl+F'
					onClick={() => {
						if (editor.current) openSearchPanel(editor.current)
					}}>
					<Search size={18} />
				</button>
				<input
					ref={fileInput}
					type='file'
					hidden
					accept='image/png,image/jpeg,image/webp,image/gif'
					onChange={event => {
						const file = event.target.files?.[0]
						if (file) void insertImage(file)
						event.target.value = ''
					}}
				/>
			</div>
			<div className='admin-editor-host' ref={host} />
			<footer className='admin-editor-footer'>
				<span>
					{stats.lines} 行 · {stats.characters.toLocaleString('zh-CN')} 字符
				</span>
				<span>Ctrl+S 保存 · Ctrl+Enter 发布</span>
			</footer>
		</div>
	)
}

export default memo(MarkdownEditor)
