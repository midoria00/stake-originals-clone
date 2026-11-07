import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { applyEntry, canAddFreeCredits, canPlace, loadWallet, round2, saveBalance, saveWallet } from '../wallet/ledger'
import { useAuth } from '../account/AuthContext'
import { accountApi, centsToCoins } from '../account/api'

const WalletContext = createContext(null)

// Accessing localStorage can itself throw (blocked storage); fall back to memory for the session.
function getStorage() {
    try {
        return window.localStorage
    } catch {
        const memory = new Map()
        return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) }
    }
}

// Two modes. Visitors (not signed in) keep the browser wallet below: convenient, not tamper-proof.
// Signed-in players use the server wallet: games call the round API (src/account/api.js gameApi)
// and pass the returned wallet to syncWallet(); the browser never decides a balance.
export function WalletProvider({ children }) {
    const auth = useAuth()
    const serverMode = auth.isAuthenticated
    const serverWallet = auth.me?.wallet
    const { updateWallet } = auth
    const serverModeRef = useRef(serverMode)
    serverModeRef.current = serverMode
    const storage = useMemo(getStorage, [])
    const stateRef = useRef(null)
    if (!stateRef.current) stateRef.current = loadWallet(storage)
    const [wallet, setWallet] = useState(stateRef.current)
    const ledgerTimer = useRef(null)

    // Games read the balance synchronously right after a bet, so the ref is the source of truth.
    const commit = useCallback((next) => {
        stateRef.current = next
        setWallet(next)
        saveBalance(storage, next.balance)
        clearTimeout(ledgerTimer.current)
        ledgerTimer.current = setTimeout(() => saveWallet(storage, stateRef.current), 250)
    }, [storage])

    useEffect(() => {
        const flush = () => {
            clearTimeout(ledgerTimer.current)
            saveWallet(storage, stateRef.current)
        }
        if (stateRef.current.migratedFrom !== null) flush()
        window.addEventListener('pagehide', flush)
        return () => {
            window.removeEventListener('pagehide', flush)
            flush()
        }
    }, [storage])

    const placeBet = useCallback((amount, source = 'casino') => {
        // A signed-in player's stake is taken by the server round API, never locally.
        if (serverModeRef.current) return false
        const value = round2(Number(amount))
        if (!canPlace(stateRef.current, value)) return false
        commit(applyEntry(stateRef.current, 'bet', value, source))
        return true
    }, [commit])

    const addWinnings = useCallback((amount, source = 'casino') => {
        if (serverModeRef.current) return
        const value = round2(Number(amount))
        if (!Number.isFinite(value) || value <= 0) return
        commit(applyEntry(stateRef.current, 'win', value, source))
    }, [commit])

    // Resolves to true when the credits were added (server mode asks the API).
    const addFreeCredits = useCallback(async (amount) => {
        if (serverModeRef.current) {
            try {
                updateWallet((await accountApi.freeCredits(amount)).wallet)
                return true
            } catch {
                return false
            }
        }
        const value = Number(amount)
        if (!canAddFreeCredits(stateRef.current, value)) return false
        commit(applyEntry(stateRef.current, 'refill', value, 'wallet'))
        return true
    }, [commit, updateWallet])

    const resetBalance = useCallback(() => commit(applyEntry(stateRef.current, 'reset', 0, 'wallet')), [commit])

    const dismissMigrationNotice = useCallback(() => commit({ ...stateRef.current, migrationSeen: true }), [commit])

    const [toasts, setToasts] = useState([])
    const toastIdRef = useRef(0)
    const showToast = useCallback((type, title, description, duration = 3000) => {
        const id = ++toastIdRef.current
        setToasts((previous) => [...previous.slice(-3), { id, type, title, description }])
        setTimeout(() => setToasts((previous) => previous.filter((toast) => toast.id !== id)), duration)
    }, [])

    const main = serverMode ? centsToCoins(serverWallet?.balance) : wallet.balance
    const promo = serverMode ? centsToCoins(serverWallet?.promoBalance) : 0
    const value = useMemo(() => ({
        mode: serverMode ? 'server' : 'local',
        // Stakes use promo credits first, so games compare a stake with the sum.
        balance: round2(main + promo),
        mainBalance: main,
        promoBalance: promo,
        syncWallet: updateWallet,
        history: wallet.history,
        stats: wallet.stats,
        migratedFrom: wallet.migratedFrom,
        migrationSeen: wallet.migrationSeen,
        placeBet,
        addWinnings,
        addFreeCredits,
        resetBalance,
        dismissMigrationNotice,
        toasts,
        showToast,
    }), [serverMode, main, promo, updateWallet, wallet, placeBet, addWinnings, addFreeCredits, resetBalance, dismissMigrationNotice, toasts, showToast])

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
    const context = useContext(WalletContext)
    if (!context) throw new Error('useWallet must be used within a WalletProvider')
    return context
}

export default WalletContext
