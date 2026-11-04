import { useCallback, useEffect, useState } from 'react'

// Small persisted state for per-visitor preferences (favourites, recents, layout). Values are
// validated on read because localStorage is user-editable; hook instances stay in sync within
// the tab (custom event) and across tabs (storage event).
const bus = typeof window !== 'undefined' ? new EventTarget() : null

export function readStored(key, fallback, validate) {
    try {
        const value = JSON.parse(localStorage.getItem(key))
        return value !== null && validate(value) ? value : fallback
    } catch {
        return fallback
    }
}

export function writeStored(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage blocked or full */ }
    bus?.dispatchEvent(new CustomEvent('change', { detail: key }))
}

export function useStoredState(key, fallback, validate) {
    const [value, setValue] = useState(() => readStored(key, fallback, validate))

    useEffect(() => {
        const sync = () => setValue(readStored(key, fallback, validate))
        const onLocal = (event) => event.detail === key && sync()
        const onStorage = (event) => event.key === key && sync()
        bus.addEventListener('change', onLocal)
        window.addEventListener('storage', onStorage)
        return () => {
            bus.removeEventListener('change', onLocal)
            window.removeEventListener('storage', onStorage)
        }
        // fallback/validate are stable module-level values at every call site
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    const update = useCallback((next) => {
        const current = readStored(key, fallback, validate)
        writeStored(key, typeof next === 'function' ? next(current) : next)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    return [value, update]
}

const isIdList = (value) => Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length <= 40)
const isRecentList = (value) => Array.isArray(value) && value.every((item) => item && typeof item.id === 'string' && typeof item.at === 'string')
const isLeagueList = (value) => Array.isArray(value) && value.every((item) => item && typeof item.id === 'string' && item.id.length <= 40 && typeof item.name === 'string' && item.name.length <= 80)

const FAVORITE_GAMES_KEY = '123bet_favorite_games_v1'
const FAVORITE_LEAGUES_KEY = '123bet_favorite_leagues_v1'
const RECENT_GAMES_KEY = '123bet_recent_games_v1'
const MAX_RECENT = 12

function useIdList(key) {
    const [ids, setIds] = useStoredState(key, [], isIdList)
    const has = useCallback((id) => ids.includes(id), [ids])
    const toggle = useCallback((id) => setIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [id, ...current].slice(0, 50))), [setIds])
    const clear = useCallback(() => setIds([]), [setIds])
    return { ids, has, toggle, clear }
}

export const useFavoriteGames = () => useIdList(FAVORITE_GAMES_KEY)

// Leagues keep their name so the favourites page works without a sports request.
export function useFavoriteLeagues() {
    const [items, setItems] = useStoredState(FAVORITE_LEAGUES_KEY, [], isLeagueList)
    const has = useCallback((id) => items.some((item) => item.id === String(id)), [items])
    const toggle = useCallback((league) => setItems((current) => {
        const id = String(league.id)
        return current.some((item) => item.id === id)
            ? current.filter((item) => item.id !== id)
            : [{ id, name: String(league.name).slice(0, 80) }, ...current].slice(0, 30)
    }), [setItems])
    const clear = useCallback(() => setItems([]), [setItems])
    return { items, has, toggle, clear }
}

export function useRecentGames() {
    const [items, setItems] = useStoredState(RECENT_GAMES_KEY, [], isRecentList)
    const add = useCallback((id) => setItems((current) => [{ id, at: new Date().toISOString() }, ...current.filter((item) => item.id !== id)].slice(0, MAX_RECENT)), [setItems])
    const clear = useCallback(() => setItems([]), [setItems])
    return { items, add, clear }
}

export function recordRecentGame(id) {
    const current = readStored(RECENT_GAMES_KEY, [], isRecentList)
    writeStored(RECENT_GAMES_KEY, [{ id, at: new Date().toISOString() }, ...current.filter((item) => item.id !== id)].slice(0, MAX_RECENT))
}
