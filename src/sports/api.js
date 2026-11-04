import { t } from '../i18n'

// Browser side only talks to our own /api/sports endpoints; provider keys never reach the client.
async function getJson(url, signal) {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body) throw new Error(body?.error ?? t('sports.loadError', { status: response.status }))
    return body
}

export const fetchMatches = (params, signal) => getJson(`/api/sports/matches?${new URLSearchParams(params)}`, signal)

export const fetchMatch = (id, signal) => getJson(`/api/sports/match?id=${encodeURIComponent(id)}`, signal)
