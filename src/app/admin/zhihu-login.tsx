'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { LoaderCircle, QrCode, RefreshCw } from 'lucide-react'
import { DialogModal } from '@/components/dialog-modal'
import type { ZhihuLoginSession } from '@/lib/zhihu-login'

type Props = {
	busy: boolean
	action: (name: string, payload?: Record<string, unknown>) => Promise<any>
	onTask: (task: () => Promise<void>) => Promise<void>
	onImported: (message: string) => Promise<void>
}
type Point = { x: number; y: number; time: number }

export default function ZhihuLogin({ busy, action, onTask, onImported }: Props) {
	const [session, setSession] = useState<ZhihuLoginSession | null>(null)
	const [error, setError] = useState('')
	const [saving, setSaving] = useState(false)
	const [frame, setFrame] = useState(0)
	const generation = useRef(0)
	const gesture = useRef<{ started: number; points: Point[] } | null>(null)
	const lastSession = useRef<ZhihuLoginSession | null>(null)
	lastSession.current = session

	async function cancel() {
		if (saving) return
		generation.current++
		const current = lastSession.current
		lastSession.current = null
		setSession(null)
		if (current) await action('zhihu-login-cancel', { id: current.id }).catch(() => {})
	}
	useEffect(
		() => () => {
			generation.current++
			if (lastSession.current) void action('zhihu-login-cancel', { id: lastSession.current.id }).catch(() => {})
		},
		[action]
	)
	useEffect(() => {
		if (!session) return
		const token = generation.current
		let timer: ReturnType<typeof setTimeout>
		let stopped = false
		async function poll() {
			try {
				const result = await action('zhihu-login-status', { id: session!.id })
				if (stopped || generation.current !== token) return
				if (result.state === 'authenticated') {
					setSaving(true)
					const saved = await action('zhihu-login-complete', { id: session!.id })
					if (stopped || generation.current !== token) return
					await onImported(saved.message)
					lastSession.current = null
					setSession(null)
					setSaving(false)
					return
				}
				setFrame(value => value + 1)
				timer = setTimeout(poll, 1500)
			} catch (cause) {
				if (!stopped && generation.current === token) {
					setError((cause as Error).message)
					setSaving(false)
				}
			}
		}
		timer = setTimeout(poll, 1000)
		return () => {
			stopped = true
			clearTimeout(timer)
		}
		// A session owns its polling lifecycle; callbacks otherwise change with workspace state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session?.id])

	function point(event: PointerEvent<HTMLImageElement>): Point {
		const bounds = event.currentTarget.getBoundingClientRect()
		return {
			x: Math.max(0, Math.min(session!.width - 1, ((event.clientX - bounds.left) * session!.width) / bounds.width)),
			y: Math.max(0, Math.min(session!.height - 1, ((event.clientY - bounds.top) * session!.height) / bounds.height)),
			time: 0
		}
	}

	return (
		<>
			<button
				className='admin-button quiet'
				type='button'
				disabled={busy || Boolean(session)}
				onClick={() =>
					void onTask(async () => {
						const token = ++generation.current
						setError('')
						const result = (await action('zhihu-login-start')) as ZhihuLoginSession
						if (generation.current !== token) {
							await action('zhihu-login-cancel', { id: result.id })
							return
						}
						setSession(result)
						setFrame(0)
					})
				}>
				<QrCode size={17} />
				知乎扫码登录
			</button>
			<DialogModal
				open={Boolean(session)}
				onClose={() => {
					void cancel()
				}}
				className='admin-zhihu-login'>
				<section role='dialog' aria-modal='true' aria-labelledby='zhihu-login-title'>
					<div className='admin-rss-list-heading'>
						<h3 id='zhihu-login-title'>知乎扫码登录</h3>
						<button
							className='admin-button quiet'
							type='button'
							disabled={saving}
							onClick={() => {
								void cancel()
							}}>
							取消登录
						</button>
					</div>
					<p>以下是知乎官方登录页面。请选择扫码登录，用知乎 App 扫码并确认；成功后凭据会自动保存到本站 RSSHub。</p>
					<p>可以点击登录画面切换扫码方式；如遇验证，请手动完成。使用已保存的 RSSHub 代理，会话最多保留 10 分钟。</p>
					{saving ? (
						<p className='admin-feedback' role='status'>
							<LoaderCircle size={18} className='admin-spin' />
							登录成功，正在自动保存凭据…
						</p>
					) : (
						session && (
							<img
								className='admin-zhihu-frame'
								src={`/api/manage/zhihu-login-frame?id=${session.id}&frame=${frame}`}
								alt='知乎官方登录画面，支持点击和拖动'
								draggable={false}
								onPointerDown={event => {
									if (error) return
									event.currentTarget.setPointerCapture(event.pointerId)
									gesture.current = { started: event.timeStamp, points: [point(event)] }
								}}
								onPointerMove={event => {
									const current = gesture.current
									if (!current || current.points.length >= 59) return
									const next = point(event)
									next.time = Math.min(5000, event.timeStamp - current.started)
									const previous = current.points.at(-1)!
									if (Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y) > 3) current.points.push(next)
								}}
								onPointerUp={event => {
									const current = gesture.current
									gesture.current = null
									if (!current) return
									const end = point(event)
									end.time = Math.min(5000, event.timeStamp - current.started)
									current.points.push(end)
									const first = current.points[0]
									const drag = current.points.length > 2 && Math.abs(end.x - first.x) + Math.abs(end.y - first.y) > 5
									void action('zhihu-login-pointer', {
										id: session.id,
										...(drag ? { kind: 'drag', points: current.points } : { kind: 'click', x: end.x, y: end.y })
									})
										.then(() => setFrame(value => value + 1))
										.catch(cause => setError((cause as Error).message))
								}}
								onPointerCancel={() => {
									gesture.current = null
								}}
							/>
						)
					)}
					{error && (
						<p className='admin-feedback error' role='alert'>
							{error}
						</p>
					)}
					<button
						type='button'
						className='admin-button quiet'
						disabled={saving}
						onClick={() =>
							void onTask(async () => {
								if (session) await action('zhihu-login-cancel', { id: session.id }).catch(() => {})
								generation.current++
								setError('')
								setSession(await action('zhihu-login-start'))
								setFrame(0)
							})
						}>
						<RefreshCw size={17} />
						重新扫码
					</button>
				</section>
			</DialogModal>
		</>
	)
}
