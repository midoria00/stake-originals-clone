const TIMEZONE = 'America/Sao_Paulo'
const DAY_MS = 24 * 60 * 60 * 1000

export const money = (value) => `₿${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const oddText = (odd) => Number(odd).toFixed(2)

// Match days follow Brasília time, like the API queries.
export const brtDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(ms)

export const shiftDate = (date, days) => brtDate(Date.parse(`${date}T12:00:00-03:00`) + days * DAY_MS)

export function dayLabel(date, today = brtDate()) {
    const diff = Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS)
    if (diff === 0) return 'Hoje'
    if (diff === 1) return 'Amanhã'
    if (diff === -1) return 'Ontem'
    return new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TIMEZONE })
}

export const kickoffTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export const kickoffDateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function clockText(status) {
    if (status.code === 'HT') return 'Intervalo'
    if (status.phase === 'live' && status.elapsed !== null) return `${status.elapsed}${status.extra ? `+${status.extra}` : ''}'`
    return status.label
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

export function selectionLabel(marketKey, selection, match) {
    const team = { home: match.home.name, away: match.away.name }
    switch (marketKey) {
        case 'match_winner':
            return selection.pick === 'draw' ? 'Empate' : team[selection.pick]
        case 'goals_ou':
        case 'corners_ou':
        case 'cards_ou':
            return `${selection.pick === 'over' ? 'Mais de' : 'Menos de'} ${selection.line}`
        case 'btts':
            return selection.pick === 'yes' ? 'Sim' : 'Não'
        case 'asian_handicap':
            return `${team[selection.pick]} ${signed(selection.line)}`
        case 'handicap_3way':
            // `line` is the home handicap for all three picks.
            return selection.pick === 'draw'
                ? `Empate (${signed(selection.line)})`
                : `${team[selection.pick]} ${signed(selection.pick === 'home' ? selection.line : -selection.line)}`
        default:
            return selection.pick
    }
}

export const RESULT_LABELS = {
    pending: 'Em aberto',
    won: 'Ganha',
    half_won: 'Meio ganha',
    void: 'Anulada',
    half_lost: 'Meio perdida',
    lost: 'Perdida',
    partial: 'Parcial',
}
