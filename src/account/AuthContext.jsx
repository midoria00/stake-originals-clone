import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { accountApi, setUnauthenticatedHandler } from './api'

// Authentication state comes only from the server (GET /api/app/me). The browser never stores
// tokens or passwords; "authenticated" means the server validated the session cookie.
const AuthContext = createContext(null)

const STAFF = ['support', 'admin']

export function AuthProvider({ children }) {
    // status: loading | guest | authenticated | disabled (accounts not configured on the server)
    const [state, setState] = useState({ status: 'loading', me: null })
    const [authModal, setAuthModal] = useState(null)
    const [sessionExpired, setSessionExpired] = useState(false)

    const refresh = useCallback(async () => {
        try {
            const me = await accountApi.me()
            if (me.accountsEnabled === false) setState({ status: 'disabled', me: null })
            else if (!me.user) setState({ status: 'guest', me: null })
            else setState({ status: 'authenticated', me })
            return me
        } catch (error) {
            setState((previous) => (previous.status === 'loading' ? { status: 'guest', me: null, error: error.code } : previous))
            return null
        }
    }, [])

    useEffect(() => {
        refresh()
        setUnauthenticatedHandler(() => {
            setState((previous) => {
                if (previous.status === 'authenticated') setSessionExpired(true)
                return { status: 'guest', me: null }
            })
        })
        return () => setUnauthenticatedHandler(null)
    }, [refresh])

    const signedIn = useCallback((me) => {
        setSessionExpired(false)
        setAuthModal(null)
        setState({ status: 'authenticated', me })
    }, [])

    const updateWallet = useCallback((wallet) => {
        if (!wallet) return
        setState((previous) => (previous.me ? { ...previous, me: { ...previous.me, wallet: { ...previous.me.wallet, ...wallet } } } : previous))
    }, [])

    const updateMe = useCallback((patch) => {
        setState((previous) => (previous.me ? { ...previous, me: { ...previous.me, ...patch } } : previous))
    }, [])

    const logout = useCallback(async () => {
        await accountApi.logout().catch(() => {})
        setState({ status: 'guest', me: null })
    }, [])

    const value = useMemo(() => ({
        ...state,
        isAuthenticated: state.status === 'authenticated',
        isStaff: STAFF.includes(state.me?.profile?.role),
        isAdmin: state.me?.profile?.role === 'admin',
        refresh,
        signedIn,
        updateWallet,
        updateMe,
        logout,
        authModal,
        openAuth: (mode = 'login') => setAuthModal(mode),
        closeAuth: () => setAuthModal(null),
        sessionExpired,
        dismissSessionExpired: () => setSessionExpired(false),
    }), [state, refresh, signedIn, updateWallet, updateMe, logout, authModal, sessionExpired])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) throw new Error('useAuth must be used within an AuthProvider')
    return context
}
