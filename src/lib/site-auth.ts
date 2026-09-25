import 'server-only'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'

const cookieName = 'site_admin'
const lifetime = 60 * 60 * 24 * 7

function secret() {
	const value = process.env.SESSION_SECRET
	if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
	return value
}

export function configured() {
	return !!process.env.ADMIN_USERNAME && !!process.env.ADMIN_PASSWORD && !!process.env.SESSION_SECRET
}

export function verifyPassword(username: string, password: string) {
	if (typeof username !== 'string' || typeof password !== 'string' || username.length > 200 || password.length > 500) return false
	const expectedUser = process.env.ADMIN_USERNAME || ''
	const expectedPassword = process.env.ADMIN_PASSWORD || ''
	const salt = createHmac('sha256', secret()).update('admin-password').digest()
	const supplied = scryptSync(password, salt, 32)
	const expected = scryptSync(expectedPassword, salt, 32)
	return username === expectedUser && timingSafeEqual(supplied, expected) && configured()
}

function sign(value: string) {
	return createHmac('sha256', secret()).update(value).digest('hex')
}

export async function login() {
	const value = `${Date.now() + lifetime * 1000}.${randomBytes(24).toString('hex')}`
	const h = await headers()
	;(await cookies()).set(cookieName, `${value}.${sign(value)}`, {
		httpOnly: true,
		secure: (h.get('x-forwarded-proto') || 'http') === 'https',
		sameSite: 'strict',
		path: '/',
		maxAge: lifetime
	})
}

export async function logout() {
	;(await cookies()).delete(cookieName)
}

export async function isAdmin() {
	if (!configured()) return false
	const token = (await cookies()).get(cookieName)?.value || ''
	const parts = token.split('.')
	if (parts.length !== 3 || Number(parts[0]) < Date.now()) return false
	const value = `${parts[0]}.${parts[1]}`
	const actual = Buffer.from(parts[2], 'hex')
	const expected = Buffer.from(sign(value), 'hex')
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function sameOrigin(request: Request) {
	const origin = request.headers.get('origin')
	if (!origin) return false
	const h = await headers()
	const host = h.get('x-forwarded-host') || h.get('host')
	const protocol = h.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')
	return origin === `${protocol}://${host}`
}
