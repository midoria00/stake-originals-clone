// Settles simulated bets from final match data. Pure functions, no I/O.
const FINISHED = new Set(['FT', 'AET', 'PEN'])
const VOID = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO'])
const STATS_GRACE_MS = 6 * 60 * 60 * 1000

const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0)

// Quarter lines (x.25 / x.75) are two half-stakes on the neighbouring lines.
function halves(line) {
    const quarter = Math.round(line * 4)
    return Math.abs(quarter % 2) === 1 ? [(quarter - 1) / 4, (quarter + 1) / 4] : [quarter / 4]
}

function combine(results) {
    if (results.length === 1) return results[0] > 0 ? 'won' : results[0] < 0 ? 'lost' : 'void'
    const total = results[0] + results[1]
    return total === 2 ? 'won' : total === 1 ? 'half_won' : total === 0 ? 'void' : total === -1 ? 'half_lost' : 'lost'
}

const overUnder = (total, leg) => combine(halves(leg.line).map((line) => (leg.pick === 'over' ? sign(total - line) : sign(line - total))))

export function settleLeg(leg, match, now = Date.now()) {
    if (!match) return 'pending'
    if (VOID.has(match.status?.code)) return 'void'
    if (!FINISHED.has(match.status?.code) || !match.score?.ft) return 'pending'
    const { home, away } = match.score.ft

    switch (leg.market) {
        case 'match_winner':
            return (leg.pick === 'home' ? home > away : leg.pick === 'away' ? away > home : home === away) ? 'won' : 'lost'
        case 'btts':
            return (home > 0 && away > 0) === (leg.pick === 'yes') ? 'won' : 'lost'
        case 'goals_ou':
            return overUnder(home + away, leg)
        case 'corners_ou':
        case 'cards_ou': {
            const totals = match.totals?.[leg.market === 'corners_ou' ? 'corners' : 'cards']
            if (totals) return overUnder(totals.home + totals.away, leg)
            // No statistics from the provider: refund once it is clear they are not coming.
            return now - Date.parse(match.kickoff) > STATS_GRACE_MS ? 'void' : 'pending'
        }
        case 'asian_handicap': {
            const margin = leg.pick === 'home' ? home - away : away - home
            return combine(halves(leg.line).map((line) => sign(margin + line)))
        }
        case 'handicap_3way': {
            const adjusted = home + leg.line - away
            return (adjusted > 0 ? 'home' : adjusted < 0 ? 'away' : 'draw') === leg.pick ? 'won' : 'lost'
        }
        default:
            return 'void'
    }
}

export function legFactor(result, odd) {
    return { won: odd, half_won: (odd + 1) / 2, void: 1, half_lost: 0.5, lost: 0 }[result] ?? 1
}

export function settleBet(bet, matchesById, now = Date.now()) {
    if (bet.status !== 'pending') return bet
    const legs = bet.legs.map((leg) => (leg.result && leg.result !== 'pending' ? leg : { ...leg, result: settleLeg(leg, matchesById.get(leg.matchId), now) }))
    const lost = legs.some((leg) => leg.result === 'lost')
    if (!lost && legs.some((leg) => leg.result === 'pending')) return { ...bet, legs }

    const factor = lost ? 0 : legs.reduce((total, leg) => total * legFactor(leg.result, leg.odd), 1)
    const payout = Math.round(bet.stake * factor * 100) / 100
    const status = payout === 0 ? 'lost' : payout > bet.stake ? 'won' : payout === bet.stake ? 'void' : 'partial'
    return { ...bet, legs, status, payout, settledAt: new Date(now).toISOString() }
}
