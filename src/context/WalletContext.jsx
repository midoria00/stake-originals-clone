import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { applyEntry, canAddFreeCredits, canPlace, loadWallet, round2, saveBalance, saveWallet } from '../wallet/ledger'

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

export function WalletProvider({ children }) {
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
        const value = round2(Number(amount))
        if (!canPlace(stateRef.current, value)) return false
        commit(applyEntry(stateRef.current, 'bet', value, source))
        return true
    }, [commit])

    const addWinnings = useCallback((amount, source = 'casino') => {
        const value = round2(Number(amount))
        if (!Number.isFinite(value) || value <= 0) return
        commit(applyEntry(stateRef.current, 'win', value, source))
    }, [commit])

    const addFreeCredits = useCallback((amount) => {
        const value = Number(amount)
        if (!canAddFreeCredits(stateRef.current, value)) return false
        commit(applyEntry(stateRef.current, 'refill', value, 'wallet'))
        return true
    }, [commit])

    const resetBalance = useCallback(() => commit(applyEntry(stateRef.current, 'reset', 0, 'wallet')), [commit])

    const dismissMigrationNotice = useCallback(() => commit({ ...stateRef.current, migrationSeen: true }), [commit])

    const [toasts, setToasts] = useState([])
    const toastIdRef = useRef(0)
    const showToast = useCallback((type, title, description, duration = 3000) => {
        const id = ++toastIdRef.current
        setToasts((previous) => [...previous.slice(-3), { id, type, title, description }])
        setTimeout(() => setToasts((previous) => previous.filter((toast) => toast.id !== id)), duration)
    }, [])

    const value = useMemo(() => ({
        balance: wallet.balance,
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
    }), [wallet, placeBet, addWinnings, addFreeCredits, resetBalance, dismissMigrationNotice, toasts, showToast])

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
    const context = useContext(WalletContext)
    if (!context) throw new Error('useWallet must be used within a WalletProvider')
    return context
}

export default WalletContext
