export function signLoginRequest(key: string, method: string, pathname: string, body: string, now?: number): string
export function verifyLoginRequest(
	key: string,
	header: unknown,
	method: string,
	pathname: string,
	body: string,
	seen: Map<string, number>,
	now?: number
): boolean
export function signLoginResponse(key: string, requestToken: string, status: number, body: string | Uint8Array): string
export function verifyLoginResponse(key: string, requestToken: string, status: number, body: string | Uint8Array, signature: unknown): boolean
