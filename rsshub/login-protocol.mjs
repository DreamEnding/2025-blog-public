import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function digest(key, value) {
	return createHmac('sha256', key).update(value).digest('hex')
}
function hash(value) {
	return createHash('sha256').update(value).digest('hex')
}
function equal(a, b) {
	return typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}
export function signLoginRequest(key, method, pathname, body, now = Date.now()) {
	const token = `${now + 60000}.${randomBytes(16).toString('hex')}`
	return `${token}.${digest(key, `${token}\n${method}\n${pathname}\n${hash(body)}`)}`
}
export function verifyLoginRequest(key, header, method, pathname, body, seen, now = Date.now()) {
	if (!key || key.length < 32 || typeof header !== 'string') return false
	const [expires, nonce, signature, extra] = header.split('.')
	if (extra || !/^\d+$/.test(expires || '') || !/^[a-f0-9]{32}$/.test(nonce || '') || Number(expires) <= now || Number(expires) > now + 60000) return false
	for (const [token, expiry] of seen) if (expiry <= now) seen.delete(token)
	if (seen.has(nonce) || !equal(signature, digest(key, `${expires}.${nonce}\n${method}\n${pathname}\n${hash(body)}`))) return false
	seen.set(nonce, Number(expires))
	return true
}
export function signLoginResponse(key, requestToken, status, body) {
	return digest(key, `${requestToken}\n${status}\n${hash(body)}`)
}
export function verifyLoginResponse(key, requestToken, status, body, signature) {
	return equal(signature, signLoginResponse(key, requestToken, status, body))
}
