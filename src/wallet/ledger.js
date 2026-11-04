// 123 Coins: fictional credits with no monetary value (cannot be bought, transferred, withdrawn or
// converted). Balance and history live in this browser's localStorage, so they are a convenience for
// the player and not a tamper-proof record. Pure functions; the React provider wires them up.
export const INITIAL_BALANCE = 1000
export const FREE_CREDITS_CEILING = 100_000
export const FREE_CREDIT_OPTIONS = [100, 500, 1000, 5000]
const MAX_HISTORY = 300

export const BALANCE_KEY = '123bet_coins_v1'
export const LEDGER_KEY = '123bet_coins_ledger_v1'
export const LEGACY_BALANCE_KEY = 'stake_wallet_balance'

export const round2 = (value) => Math.round(value * 100) / 100

const emptyStats = () => ({ wagered: 0, returned: 0, bets: 0, payouts: 0, biggestPayout: 0, freeCredits: 0, bySource: {} })

function read(storage, key) {
    try { return storage.getItem(key) } catch { return null }
}

function makeEntry(type, amount, balance, source, now) {
    return {
        id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        amount: round2(amount),
        balance: round2(balance),
        source,
        at: new Date(now).toISOString(),
    }
}

export function loadWallet(storage, now = Date.now()) {
    let balance = Number.parseFloat(read(storage, BALANCE_KEY))
    let ledger = null
    try { ledger = JSON.parse(read(storage, LEDGER_KEY)) } catch { /* corrupt ledger: start a new one */ }
    const validLedger = Boolean(ledger && Array.isArray(ledger.history) && ledger.stats && typeof ledger.stats === 'object')

    // Visitors of the previous version keep their balance; it now counts as 123 Coins.
    let migratedFrom = null
    if (!Number.isFinite(balance)) {
        const legacy = Number.parseFloat(read(storage, LEGACY_BALANCE_KEY))
        if (Number.isFinite(legacy) && legacy >= 0) {
            balance = round2(legacy)
            migratedFrom = balance
        } else {
            balance = INITIAL_BALANCE
        }
    }
    balance = Math.max(0, round2(balance))

    const state = {
        balance,
        history: validLedger ? ledger.history.slice(0, MAX_HISTORY) : [],
        stats: validLedger ? { ...emptyStats(), ...ledger.stats } : emptyStats(),
        migratedFrom: migratedFrom ?? (validLedger ? ledger.migratedFrom ?? null : null),
        migrationSeen: validLedger ? Boolean(ledger.migrationSeen) : false,
    }
    if (migratedFrom !== null) state.history = [makeEntry('migration', balance, balance, 'wallet', now), ...state.history]
    return state
}

// type: 'bet' (stake leaves the balance), 'win' (payout returns), 'refill' (free credits), 'reset'.
export function applyEntry(state, type, amount, source = 'casino', now = Date.now()) {
    const balance = round2(type === 'reset' ? INITIAL_BALANCE : type === 'bet' ? state.balance - amount : state.balance + amount)
    const stats = { ...state.stats, bySource: { ...state.stats.bySource } }
    if (type === 'bet' || type === 'win') {
        const perSource = { wagered: 0, returned: 0, bets: 0, ...stats.bySource[source] }
        if (type === 'bet') {
            stats.wagered = round2(stats.wagered + amount)
            stats.bets += 1
            perSource.wagered = round2(perSource.wagered + amount)
            perSource.bets += 1
        } else {
            stats.returned = round2(stats.returned + amount)
            stats.payouts += 1
            stats.biggestPayout = Math.max(stats.biggestPayout, round2(amount))
            perSource.returned = round2(perSource.returned + amount)
        }
        stats.bySource[source] = perSource
    }
    if (type === 'refill') stats.freeCredits = round2(stats.freeCredits + amount)
    const entryAmount = type === 'reset' ? INITIAL_BALANCE : amount
    return { ...state, balance, stats, history: [makeEntry(type, entryAmount, balance, source, now), ...state.history].slice(0, MAX_HISTORY) }
}

export function canPlace(state, amount) {
    return Number.isFinite(amount) && amount > 0 && round2(amount) <= state.balance
}

export function canAddFreeCredits(state, amount) {
    return FREE_CREDIT_OPTIONS.includes(amount) && state.balance + amount <= FREE_CREDITS_CEILING
}

export function saveBalance(storage, balance) {
    try { storage.setItem(BALANCE_KEY, String(balance)) } catch { /* storage full or blocked */ }
}

export function saveLedger(storage, state) {
    try {
        storage.setItem(LEDGER_KEY, JSON.stringify({ history: state.history, stats: state.stats, migratedFrom: state.migratedFrom, migrationSeen: state.migrationSeen }))
        storage.removeItem(LEGACY_BALANCE_KEY)
    } catch { /* storage full or blocked */ }
}
