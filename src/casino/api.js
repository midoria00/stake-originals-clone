import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

// Browser side of the casino catalog: only our own /api/casino endpoints; no provider is called directly.
async function getJson(url, signal) {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body) {
        const error = new Error(body?.error ?? t('casino.loadError'))
        error.status = response.status
        throw error
    }
    return body
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== ''))

export const fetchProviders = (signal) => getJson('/api/casino/providers', signal)
export const fetchGames = (params, signal) => getJson(`/api/casino/games?${query(params)}`, signal)
export const fetchLaunch = (id, signal) => getJson(`/api/casino/launch?${query({ game: id })}`, signal)

// Provider statuses: one request per page load (the CDN shares it); callers render the static registry meanwhile.
let providersCache = null
let providersRequest = null

export function useProviderStatuses() {
    const [state, setState] = useState({ data: providersCache, error: null })
    useEffect(() => {
        if (providersCache) return undefined
        let active = true
        providersRequest ??= fetchProviders().then((data) => (providersCache = data)).finally(() => { providersRequest = null })
        providersRequest.then((data) => active && setState({ data, error: null }), (error) => active && setState({ data: null, error }))
        return () => { active = false }
    }, [])
    return state
}

export const PAGE = 24

// Paged catalog list; `params` changes reset it, `loadMore` appends the next server page.
// `skip` keeps the hook idle (hooks cannot be called conditionally).
export function useGameList({ skip = false, ...params }) {
    const key = skip ? null : JSON.stringify(params)
    const [state, setState] = useState({ items: [], total: null, nextCursor: 0, loading: true, error: null })
    const controllerRef = useRef(null)
    // Page being fetched for the current list: a second trigger before React re-renders (the
    // scroll sentinel and the button, or two observer callbacks) must not abort and refetch it.
    const pendingRef = useRef(null)

    const load = useCallback(async (cursor, reset) => {
        if (!reset && pendingRef.current === cursor) return
        controllerRef.current?.abort()
        if (key === null) {
            pendingRef.current = null
            return setState({ items: [], total: 0, nextCursor: null, loading: false, error: null })
        }
        const controller = new AbortController()
        controllerRef.current = controller
        pendingRef.current = cursor
        setState((previous) => ({ ...(reset ? { items: [], total: null } : previous), nextCursor: cursor, loading: true, error: null }))
        try {
            const data = await fetchGames({ ...JSON.parse(key), cursor, limit: PAGE }, controller.signal)
            setState((previous) => ({
                items: reset ? data.items : [...previous.items, ...data.items],
                total: data.total,
                nextCursor: data.nextCursor,
                loading: false,
                error: null,
            }))
        } catch (error) {
            if (error.name !== 'AbortError') setState((previous) => ({ ...previous, loading: false, error }))
        } finally {
            if (controllerRef.current === controller) pendingRef.current = null
        }
    }, [key])

    useEffect(() => {
        load(0, true)
        return () => {
            controllerRef.current?.abort()
            pendingRef.current = null
        }
    }, [load])

    const { nextCursor, loading } = state
    const loadMore = useCallback(() => {
        if (!loading && nextCursor !== null) load(nextCursor, false)
    }, [load, loading, nextCursor])

    return { ...state, hasMore: nextCursor !== null, loadMore, reload: () => load(0, true) }
}
