import { create } from 'zustand'
import { clearAllAuthCache, getAuthToken as getToken, hasAuth as checkAuth } from '@/lib/auth'
interface AuthStore {
	// State
	isAuth: boolean
	// Actions
	clearAuth: () => void
	refreshAuthState: () => void
	getAuthToken: () => Promise<string>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
	isAuth: false,
	clearAuth: () => {
		clearAllAuthCache()
		set({ isAuth: false })
	},

	refreshAuthState: async () => {
		set({ isAuth: await checkAuth() })
	},

	getAuthToken: async () => {
		const token = await getToken()
		get().refreshAuthState()
		return token
	}
}))

if (typeof window !== 'undefined') {
	checkAuth().then(isAuth => {
		if (isAuth) useAuthStore.setState({ isAuth })
	})
}
