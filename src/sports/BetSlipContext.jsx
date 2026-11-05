import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { accountApi, api, coinsInput, errorMessage, newKey } from '../account/api'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { fetchMatch, fetchMatches } from './api'
import { money, selectionLabel } from './format'
import { fromServerBet } from './serverBets'
import { settleBet } from './settlement'

// Simulated sports bets. Stakes come from the same fictional wallet as the casino games;
// nothing here touches real money.
const SLIP_KEY = 'sports_betslip_v1'
const BETS_KEY = 'sports_bets_v1'
export const MIN_STAKE = 0.1
export const MAX_STAKE = 10000
const MAX_SELECTIONS = 20
const MAX_BETS_KEPT = 200
const SETTLE_EVERY_MS = 60_000
const SERVER_ERRORS = { payout_limit: 'payoutLimit', invalid_selections: 'invalidSelections', sports_unavailable: 'unavailable' }

const BetSlipContext = createContext(null)

function read(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key))
        return Array.isArray(value) ? value : fallback
    } catch {
        return fallback
    }
}

function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked */ }
}

// Serialises bet bookkeeping across open tabs so a winning bet is only paid once.
const withLock = (fn) => (navigator.locks?.request ? navigator.locks.request('sports-bets', fn) : fn())

export const stakeValue = (text) => {
    const value = Number(String(text ?? '').replace(',', '.'))
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN
}

const validStake = (value) => value >= MIN_STAKE && value <= MAX_STAKE

function findSelection(match, selectionId) {
    for (const market of match.markets ?? []) {
        const selection = market.selections.find((s) => s.id === selectionId)
        if (selection) return selection
    }
    return null
}

export function BetSlipProvider({ children }) {
    const { placeBet, addWinnings, showToast, mode: walletMode, syncWallet } = useWallet()
    const server = walletMode === 'server'
    const [selections, setSelections] = useState(() => read(SLIP_KEY, []))
    const [mode, setMode] = useState('single')
    const [stakes, setStakes] = useState({})
    const [bets, setBets] = useState(() => read(BETS_KEY, []))
    const [placing, setPlacing] = useState(false)
    const [message, setMessage] = useState(null)
    const walletRef = useRef({ addWinnings, showToast })
    walletRef.current = { addWinnings, showToast, syncWallet }
    const knownRef = useRef(null)
    // One idempotency key per distinct bet payload, so a retry after a lost response cannot place it twice.
    const keysRef = useRef(new Map())

    useEffect(() => write(SLIP_KEY, selections), [selections])

    useEffect(() => {
        if (selections.length < 2 && mode === 'multiple') setMode('single')
    }, [selections.length, mode])

    const toggle = useCallback((match, market, selection) => {
        const key = `${match.id}|${selection.id}`
        setSelections((previous) => {
            if (previous.some((s) => s.key === key)) return previous.filter((s) => s.key !== key)
            const entry = {
                key,
                matchId: match.id,
                home: match.home.name,
                away: match.away.name,
                league: match.league.name,
                kickoff: match.kickoff,
                simulated: Boolean(match.simulated),
                live: match.status.phase === 'live',
                selectionId: selection.id,
                market: market.key,
                marketLabel: market.label,
                pick: selection.pick,
                line: selection.line,
                label: selectionLabel(market.key, selection, match),
                odd: selection.odd,
            }
            // One pick per match: a multiple cannot combine outcomes of the same game.
            return [...previous.filter((s) => s.matchId !== match.id), entry].slice(-MAX_SELECTIONS)
        })
        setMessage(null)
    }, [])

    const remove = useCallback((key) => {
        setSelections((previous) => previous.filter((s) => s.key !== key))
        setMessage(null)
    }, [])

    const clear = useCallback(() => {
        setSelections([])
        setStakes({})
        setMessage(null)
    }, [])

    const isSelected = useCallback((matchId, selectionId) => selections.some((s) => s.key === `${matchId}|${selectionId}`), [selections])

    const totalOdd = selections.reduce((total, s) => total * s.odd, 1)
    const plannedBets = mode === 'multiple'
        ? [{ type: 'multiple', legs: selections, stake: stakeValue(stakes.multiple), odd: totalOdd }]
        : selections.map((s) => ({ type: 'single', legs: [s], stake: stakeValue(stakes[s.key]), odd: s.odd }))
    const totalStake = plannedBets.reduce((total, bet) => total + (Number.isFinite(bet.stake) ? bet.stake : 0), 0)
    const potentialReturn = plannedBets.reduce((total, bet) => total + (Number.isFinite(bet.stake) ? bet.stake * bet.odd : 0), 0)

    // Local checks before the review step and again before placing.
    const check = useCallback(() => {
        if (!selections.length) return false
        if (mode === 'multiple' && selections.length < 2) {
            setMessage({ type: 'error', text: t('sports.errors.multipleMin') })
            return false
        }
        if (!plannedBets.every((bet) => validStake(bet.stake))) {
            setMessage({ type: 'error', text: t('sports.errors.stakeRange', { min: money(MIN_STAKE), max: money(MAX_STAKE) }) })
            return false
        }
        setMessage(null)
        return true
    }, [selections.length, mode, plannedBets])

    // Signed-in players: the server re-reads the matches, checks market, status and odds, debits the
    // stake and later settles. The browser only sends what the player picked and the odds it saw.
    const loadServerBets = useCallback(async () => {
        try {
            const items = (await accountApi.sportsBets({ limit: 50 })).items.map(fromServerBet)
            const known = knownRef.current
            const settledNow = known ? items.filter((bet) => bet.status !== 'pending' && known.get(bet.id) === 'pending') : []
            knownRef.current = new Map(items.map((bet) => [bet.id, bet.status]))
            setBets(items)
            // Listing settles lazily on the server, so the wallet may have changed.
            if (!known || settledNow.length) accountApi.wallet().then((res) => res?.wallet && walletRef.current.syncWallet(res.wallet)).catch(() => {})
            if (settledNow.length) {
                const credit = settledNow.reduce((total, bet) => total + (bet.payout ?? 0), 0)
                walletRef.current.showToast(
                    credit > 0 ? 'win' : 'loss',
                    t('sports.settledToast', { count: settledNow.length }),
                    credit > 0 ? t('sports.settledReturn', { amount: money(credit) }) : t('sports.settledNoReturn'),
                )
            }
        } catch { /* keep the list on screen; the next poll retries */ }
    }, [])

    useEffect(() => {
        if (!server) {
            knownRef.current = null
            setBets(read(BETS_KEY, []))
            return undefined
        }
        loadServerBets()
        const timer = setInterval(() => !document.hidden && loadServerBets(), SETTLE_EVERY_MS)
        return () => clearInterval(timer)
    }, [server, loadServerBets])

    const placeOnServer = useCallback(async () => {
        const placedKeys = new Set()
        let spent = 0
        let count = 0
        let failure = null
        for (const bet of plannedBets) {
            const payload = {
                kind: bet.type,
                stake: coinsInput(bet.stake),
                selections: bet.legs.map((leg) => ({ matchId: leg.matchId, market: leg.market, pick: leg.pick, line: leg.line ?? null, odds: leg.odd })),
            }
            const signature = JSON.stringify(payload)
            const idempotencyKey = keysRef.current.get(signature) ?? newKey('sports')
            keysRef.current.set(signature, idempotencyKey)
            try {
                const res = await api('POST', 'sports/bets', { ...payload, idempotencyKey })
                keysRef.current.delete(signature)
                if (res.wallet) walletRef.current.syncWallet(res.wallet)
                bet.legs.forEach((leg) => placedKeys.add(leg.key))
                spent += bet.stake
                count += 1
            } catch (error) {
                // A definitive answer ends this attempt; a network or 5xx failure keeps the key for the retry.
                if (error?.status >= 400 && error.status < 500) keysRef.current.delete(signature)
                failure = { error, bet }
                break
            }
        }
        if (placedKeys.size) {
            setSelections((previous) => previous.filter((s) => !placedKeys.has(s.key)))
            setStakes((previous) => Object.fromEntries(Object.entries(previous).filter(([k]) => !placedKeys.has(k) && k !== 'multiple')))
            walletRef.current.showToast('bet', t('sports.placedToastTitle'), t('sports.placedToastBody', { count, amount: money(spent) }))
            loadServerBets()
        }
        if (!failure) return setMessage({ type: 'success', text: t('sports.placed') })

        const { error, bet } = failure
        if (error.code === 'odds_changed' && Array.isArray(error.data?.changes)) {
            const changes = error.data.changes
            setSelections((previous) => previous.map((s) => {
                const change = changes.find((c) => c.matchId === s.matchId && c.market === s.market && c.pick === s.pick)
                return change ? { ...s, odd: change.odds, previousOdd: s.odd } : s
            }))
            return setMessage({ type: 'warning', text: t('sports.errors.oddsChanged') })
        }
        if (error.code === 'match_closed' || error.code === 'market_closed') {
            const leg = bet.legs.find((l) => l.matchId === error.data?.matchId)
            const problem = !leg ? errorMessage(error)
                : error.code === 'match_closed' ? t('sports.errors.matchClosed', { home: leg.home, away: leg.away })
                    : t('sports.errors.marketClosed', { label: leg.label })
            return setMessage({ type: 'error', text: t('sports.errors.removeToContinue', { problems: problem }) })
        }
        const key = SERVER_ERRORS[error.code]
        return setMessage({ type: 'error', text: key ? t(`sports.errors.${key}`) : errorMessage(error) })
    }, [plannedBets, loadServerBets])

    const place = useCallback(async () => {
        if (placing || !check()) return

        setPlacing(true)
        setMessage(null)
        if (server) {
            try { await placeOnServer() } finally { setPlacing(false) }
            return
        }
        try {
            // Re-check every pick against fresh data: match state, suspension and current odds.
            const ids = [...new Set(selections.map((s) => s.matchId))]
            const fresh = new Map((await Promise.all(ids.map((id) => fetchMatch(id)))).map(({ match }) => [match.id, match]))
            const problems = []
            let changed = false
            const updated = selections.map((s) => {
                const match = fresh.get(s.matchId)
                if (!match || (match.status.phase !== 'scheduled' && match.status.phase !== 'live')) {
                    problems.push(t('sports.errors.matchClosed', { home: s.home, away: s.away }))
                    return s
                }
                const selection = findSelection(match, s.selectionId)
                if (!selection || selection.suspended) {
                    problems.push(t('sports.errors.marketClosed', { label: s.label }))
                    return s
                }
                const live = match.status.phase === 'live'
                if (selection.odd !== s.odd || live !== s.live) {
                    changed = true
                    return { ...s, odd: selection.odd, live, previousOdd: s.odd }
                }
                return s
            })
            if (problems.length) {
                setSelections(updated)
                return setMessage({ type: 'error', text: t('sports.errors.removeToContinue', { problems: problems.join(' · ') }) })
            }
            if (changed) {
                setSelections(updated)
                return setMessage({ type: 'warning', text: t('sports.errors.oddsChanged') })
            }

            if (!placeBet(totalStake, 'sports')) return setMessage({ type: 'error', text: t('sports.errors.insufficient') })

            const placedAt = new Date().toISOString()
            const created = plannedBets.map((bet, index) => ({
                id: `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`,
                type: bet.type,
                placedAt,
                stake: bet.stake,
                odd: Math.round(bet.odd * 100) / 100,
                potential: Math.round(bet.stake * bet.odd * 100) / 100,
                status: 'pending',
                payout: null,
                simulated: bet.legs.some((leg) => leg.simulated),
                legs: bet.legs.map((leg) => ({
                    matchId: leg.matchId, home: leg.home, away: leg.away, league: leg.league, kickoff: leg.kickoff,
                    market: leg.market, marketLabel: leg.marketLabel, pick: leg.pick, line: leg.line,
                    label: leg.label, odd: leg.odd, live: leg.live, result: 'pending',
                })),
            }))
            await withLock(() => {
                const next = [...created, ...read(BETS_KEY, [])].slice(0, MAX_BETS_KEPT)
                write(BETS_KEY, next)
                setBets(next)
            })
            setSelections([])
            setStakes({})
            showToast('bet', t('sports.placedToastTitle'), t('sports.placedToastBody', { count: created.length, amount: money(totalStake) }))
            setMessage({ type: 'success', text: t('sports.placed') })
        } catch {
            setMessage({ type: 'error', text: t('sports.errors.confirmFailed') })
        } finally {
            setPlacing(false)
        }
    }, [placing, check, server, placeOnServer, selections, plannedBets, placeBet, totalStake, showToast])

    // Settle pending bets whose matches have kicked off (visitors only: the server settles signed-in bets).
    useEffect(() => {
        if (server) return undefined
        let cancelled = false
        const settle = async () => {
            const pending = read(BETS_KEY, []).filter((bet) => bet.status === 'pending')
            const ids = [...new Set(pending.flatMap((bet) => bet.legs
                .filter((leg) => leg.result === 'pending' && Date.parse(leg.kickoff) < Date.now())
                .map((leg) => leg.matchId)))]
            if (!ids.length) return
            const chunks = []
            for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20))
            const results = await Promise.all(chunks.map((chunk) => fetchMatches({ view: 'ids', ids: chunk.join(',') }).catch(() => null)))
            const byId = new Map(results.flatMap((r) => r?.matches ?? []).map((m) => [m.id, m]))
            if (!byId.size || cancelled) return

            await withLock(() => {
                let credit = 0
                let settled = 0
                const next = read(BETS_KEY, []).map((bet) => {
                    const result = settleBet(bet, byId)
                    if (bet.status === 'pending' && result.status !== 'pending') {
                        settled += 1
                        credit += result.payout
                    }
                    return result
                })
                write(BETS_KEY, next)
                if (!cancelled) setBets(next)
                if (credit > 0) walletRef.current.addWinnings(credit, 'sports')
                if (settled) {
                    walletRef.current.showToast(
                        credit > 0 ? 'win' : 'loss',
                        t('sports.settledToast', { count: settled }),
                        credit > 0 ? t('sports.settledReturn', { amount: money(credit) }) : t('sports.settledNoReturn'),
                    )
                }
            })
        }
        settle()
        const timer = setInterval(() => !document.hidden && settle(), SETTLE_EVERY_MS)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [server])

    // Only settled bets can be removed: open ones still hold a stake waiting for the result.
    const clearSettled = useCallback(() => server ? undefined : withLock(() => {
        const next = read(BETS_KEY, []).filter((bet) => bet.status === 'pending')
        write(BETS_KEY, next)
        setBets(next)
    }), [server])

    const value = useMemo(() => ({
        selections, mode, setMode, stakes, setStakes, bets, placing, message,
        toggle, remove, clear, clearSettled, isSelected, check, place, plannedBets, totalOdd, totalStake, potentialReturn,
    }), [selections, mode, stakes, bets, placing, message, toggle, remove, clear, clearSettled, isSelected, check, place, plannedBets, totalOdd, totalStake, potentialReturn])

    return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
}

export function useBetSlip() {
    const context = useContext(BetSlipContext)
    if (!context) throw new Error('useBetSlip must be used within BetSlipProvider')
    return context
}
