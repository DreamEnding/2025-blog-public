'use client'

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { HOME_WORLD } from '@/hooks/use-center'

interface Props {
	children: React.ReactNode
	editing: boolean
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function edgeStrength(position: number, size: number, fraction: number) {
	const zone = size * fraction
	if (position < zone) return -Math.pow(1 - position / zone, 2)
	if (position > size - zone) return Math.pow(1 - (size - position) / zone, 2)
	return 0
}

export default function HomeCanvas({ children, editing }: Props) {
	const viewportRef = useRef<HTMLDivElement>(null)
	const worldRef = useRef<HTMLDivElement>(null)
	const position = useRef({ x: 0, y: 0 })
	const target = useRef({ x: 0, y: 0 })
	const velocity = useRef({ x: 0, y: 0 })
	const drag = useRef<{ x: number; y: number } | null>(null)
	const viewportSize = useRef({ width: 0, height: 0 })
	const initialized = useRef(false)
	const [ready, setReady] = useState(false)

	function bounds() {
		const viewport = viewportRef.current
		const width = viewport?.clientWidth || 0
		const height = viewport?.clientHeight || 0
		return {
			minX: width < HOME_WORLD.width ? width - HOME_WORLD.width : (width - HOME_WORLD.width) / 2,
			maxX: width < HOME_WORLD.width ? 0 : (width - HOME_WORLD.width) / 2,
			minY: height < HOME_WORLD.height ? height - HOME_WORLD.height : (height - HOME_WORLD.height) / 2,
			maxY: height < HOME_WORLD.height ? 0 : (height - HOME_WORLD.height) / 2
		}
	}

	function render() {
		const world = worldRef.current
		if (!world) return
		const { minX, maxX, minY, maxY } = bounds()
		position.current.x = clamp(position.current.x, minX, maxX)
		position.current.y = clamp(position.current.y, minY, maxY)
		world.style.transform = `translate3d(${position.current.x}px, ${position.current.y}px, 0)`
	}

	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport) return
		const measure = () => {
			if (!initialized.current) {
				position.current = {
					x: (viewport.clientWidth - HOME_WORLD.width) / 2,
					y: (viewport.clientHeight - HOME_WORLD.height) / 2
				}
				initialized.current = true
			} else {
				position.current.x += (viewport.clientWidth - viewportSize.current.width) / 2
				position.current.y += (viewport.clientHeight - viewportSize.current.height) / 2
			}
			viewportSize.current = { width: viewport.clientWidth, height: viewport.clientHeight }
			render()
			setReady(true)
		}
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(viewport)
		let frame = 0
		let last = performance.now()
		const animate = (now: number) => {
			const dt = Math.min(0.034, (now - last) / 1000)
			last = now
			const ease = 1 - Math.exp(-9 * dt)
			velocity.current.x += (target.current.x - velocity.current.x) * ease
			velocity.current.y += (target.current.y - velocity.current.y) * ease
			if (Math.abs(velocity.current.x) > 1 || Math.abs(velocity.current.y) > 1) {
				position.current.x += velocity.current.x * dt
				position.current.y += velocity.current.y * dt
				render()
			}
			frame = requestAnimationFrame(animate)
		}
		frame = requestAnimationFrame(animate)
		const stop = () => {
			target.current = { x: 0, y: 0 }
		}
		window.addEventListener('blur', stop)
		return () => {
			observer.disconnect()
			cancelAnimationFrame(frame)
			window.removeEventListener('blur', stop)
		}
	}, [])

	function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
		if (drag.current) {
			position.current.x += event.clientX - drag.current.x
			position.current.y += event.clientY - drag.current.y
			drag.current = { x: event.clientX, y: event.clientY }
			render()
			return
		}
		if (editing || event.pointerType !== 'mouse') return
		const rect = event.currentTarget.getBoundingClientRect()
		target.current.x = -edgeStrength(event.clientX - rect.left, rect.width, 0.17) * 520
		target.current.y = -edgeStrength(event.clientY - rect.top, rect.height, 0.12) * 260
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
		if (editing || (event.target !== event.currentTarget && event.target !== worldRef.current)) return
		drag.current = { x: event.clientX, y: event.clientY }
		target.current = { x: 0, y: 0 }
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function handleWheel(event: WheelEvent<HTMLDivElement>) {
		if (editing) return
		event.preventDefault()
		target.current = { x: 0, y: 0 }
		position.current.x -= event.deltaX
		position.current.y -= event.deltaY
		render()
	}

	return (
		<div
			ref={viewportRef}
			className='home-canvas-viewport'
			role='region'
			aria-label='主页画布'
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={() => {
				drag.current = null
			}}
			onPointerCancel={() => {
				drag.current = null
			}}
			onPointerLeave={() => {
				target.current = { x: 0, y: 0 }
			}}
			onWheel={handleWheel}>
			<div ref={worldRef} className='home-canvas-world' style={{ width: HOME_WORLD.width, height: HOME_WORLD.height, opacity: ready ? 1 : 0 }}>
				{children}
			</div>
			<p className='home-canvas-hint'>拖动画布空白处或移动到边缘探索</p>
		</div>
	)
}
