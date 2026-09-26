'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useCenterStore } from '@/hooks/use-center'

interface Props {
	className?: string
	width: number
	height?: number
	x: number
	y: number
	children: React.ReactNode
}

export default function Card({ children, width, height, x, y, className }: Props) {
	const ready = useCenterStore(state => state.width > 0)
	if (ready)
		return (
			<motion.div
				className={cn('card squircle', className)}
				initial={false}
				animate={{ left: x, top: y, width, height }}
				whileHover={{ scale: 1.05 }}
				whileTap={{ scale: 0.95 }}>
				{children}
			</motion.div>
		)

	return null
}
