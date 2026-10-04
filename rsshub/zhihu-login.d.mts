export function allowedLoginUrl(value: string): boolean
export function zhihuCookieHeader(cookies: { name: string; value: string; domain: string; expires: number }[], now?: number): string | null
export function createZhihuLogin(options?: { launch?: (proxy: string) => Promise<any>; clock?: () => number }): {
	start(owner: string, proxy: string): Promise<any>
	status(owner: string, id: string): Promise<any>
	frame(owner: string, id: string): Promise<Buffer>
	pointer(owner: string, id: string, input: { kind: string; x?: number; y?: number; points?: { x: number; y: number; time: number }[] }): Promise<any>
	capture(owner: string, id: string): Promise<string>
	cancel(owner: string, id: string): Promise<any>
	close(): Promise<void>
}
