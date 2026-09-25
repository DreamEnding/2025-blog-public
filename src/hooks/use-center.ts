'use client'

import { useEffect } from 'react'
import { create } from 'zustand'

export const HOME_WORLD = { width: 1760, height: 1050 }

type CenterState = {
	x: number
	y: number
	centerX: number
	centerY: number
	width: number
	height: number
	setCenter: (x: number, y: number) => void
	recalc: () => void
}

const computeCenter = () => {
	if (typeof window === 'undefined') {
		return { x: 0, y: 0, width: 0, height: 0 }
	}
	const width = window.innerWidth
	const height = window.innerHeight
	const homeCanvas = window.location.pathname === '/'
	return {
		x: homeCanvas ? HOME_WORLD.width / 2 : Math.floor(width / 2),
		y: homeCanvas ? HOME_WORLD.height / 2 : Math.floor(height / 2) - 24,
		centerX: Math.floor(width / 2),
		centerY: Math.floor(height / 2),
		width,
		height
	}
}

export const useCenterStore = create<CenterState>(set => ({
	x: 0,
	y: 0,
	centerX: 0,
	centerY: 0,
	width: 0,
	height: 0,
	setCenter: (x, y) => set({ x, y }),
	recalc: () => {
		const c = computeCenter()
		set({ x: c.x, y: c.y, width: c.width, height: c.height, centerX: c.centerX, centerY: c.centerY })
	}
}))

export function useCenterInit() {
	useEffect(() => {
		const update = () => useCenterStore.getState().recalc()
		update()
		window.addEventListener('resize', update)
		return () => window.removeEventListener('resize', update)
	}, [])
}
