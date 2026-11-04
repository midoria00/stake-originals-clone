import { hasKey, t } from '../i18n'
import { formatCoins, formatWeekdayDateTime } from '../i18n/format'

const TIMEZONE = 'America/Sao_Paulo'
const DAY_MS = 24 * 60 * 60 * 1000

// Amounts in 123 Coins as plain text (toasts, messages, aria labels).
export const money = (value) => t('sports.coinsAmount', { amount: formatCoins(value) })

export const oddText = (odd) => Number(odd).toFixed(2)

// Server labels are pt-BR; the dictionary wins when it has the key, so other locales can override them.
const localized = (group, key, fallback) => (hasKey(`sports.${group}.${key}`) ? t(`sports.${group}.${key}`) : fallback)
export const marketLabel = (market) => localized('markets', market.key ?? market, market.label ?? market)
export const statusLabel = (status) => localized('status', status.code, status.label)
export const statLabel = (stat) => localized('statsLabels', stat.key, stat.label)

// Match days follow Brasília time, like the API queries.
export const brtDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(ms)

export const shiftDate = (date, days) => brtDate(Date.parse(`${date}T12:00:00-03:00`) + days * DAY_MS)

export function dayLabel(date, today = brtDate()) {
    const diff = Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS)
    if (diff === 0) return t('common.today')
    if (diff === 1) return t('common.tomorrow')
    if (diff === -1) return t('common.yesterday')
    return new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TIMEZONE })
}

export const kickoffTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export const kickoffDateTime = (iso) => formatWeekdayDateTime(iso)

export function clockText(status) {
    if (status.code === 'HT') return statusLabel(status)
    if (status.phase === 'live' && status.elapsed !== null) return `${status.elapsed}${status.extra ? `+${status.extra}` : ''}'`
    return statusLabel(status)
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

export function selectionLabel(marketKey, selection, match) {
    const team = { home: match.home.name, away: match.away.name }
    switch (marketKey) {
        case 'match_winner':
            return selection.pick === 'draw' ? t('sports.draw') : team[selection.pick]
        case 'goals_ou':
        case 'corners_ou':
        case 'cards_ou':
            return t(selection.pick === 'over' ? 'sports.over' : 'sports.under', { line: selection.line })
        case 'btts':
            return t(selection.pick === 'yes' ? 'sports.yes' : 'sports.no')
        case 'asian_handicap':
            return `${team[selection.pick]} ${signed(selection.line)}`
        case 'handicap_3way':
            // `line` is the home handicap for all three picks.
            return selection.pick === 'draw'
                ? t('sports.drawLine', { line: signed(selection.line) })
                : `${team[selection.pick]} ${signed(selection.pick === 'home' ? selection.line : -selection.line)}`
        default:
            return selection.pick
    }
}

export const resultLabel = (result) => t(`sports.results.${result}`)
