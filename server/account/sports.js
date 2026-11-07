// Server-authoritative simulated sports bets (123 Coins only, no real money). The browser sends
// picks and the odds it saw; the server re-reads every match from the sports service, accepts a pick
// only while it is open for betting at exactly those odds, and settles from the provider result.
import { settleLeg } from '../../src/sports/settlement.js'
import { MARKET_LABELS, selectionId } from '../sports/markets.js'
import { ApiError } from './http.js'
import * as v from './validate.js'

const MATCH_ID = /^(\d{1,10}|d-\d{8}-\d{1,3})$/
const MAX_SELECTIONS = 20
const MAX_PAYOUT_CENTS = 10_000_000_000n // 100 million coins
const BP = 10000n
const IDS_PER_CALL = 20

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

// Same wording the betting slip shows (src/sports/format.js selectionLabel), built from server data.
function labelOf(market, pick, line, match) {
    const team = { home: match.home.name, away: match.away.name }
    switch (market) {
        case 'match_winner': return pick === 'draw' ? 'Empate' : team[pick]
        case 'goals_ou':
        case 'corners_ou':
        case 'cards_ou': return `${pick === 'over' ? 'Mais' : 'Menos'} de ${line}`
        case 'btts': return pick === 'yes' ? 'Sim' : 'Não'
        case 'asian_handicap': return `${team[pick]} ${signed(line)}`
        case 'handicap_3way': return pick === 'draw' ? `Empate (${signed(line)})` : `${team[pick]} ${signed(pick === 'home' ? line : -line)}`
        default: return pick
    }
}

function parseSelections(raw, kind) {
    const invalid = () => v.fail('invalid_selections')
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SELECTIONS) invalid()
    if ((kind === 'single' && raw.length !== 1) || (kind === 'multiple' && raw.length < 2)) invalid()
    const picks = raw.map((item) => {
        if (!item || typeof item !== 'object') invalid()
        const { matchId, market, pick, line = null, odds } = item
        if (typeof matchId !== 'string' || !MATCH_ID.test(matchId)) invalid()
        if (typeof market !== 'string' || !Object.hasOwn(MARKET_LABELS, market)) invalid()
        if (typeof pick !== 'string' || !/^[a-z]{2,10}$/.test(pick)) invalid()
        if (line !== null && !(typeof line === 'number' && Number.isFinite(line) && Math.abs(line) < 1000)) invalid()
        if (typeof odds !== 'number' || !Number.isFinite(odds) || odds <= 1 || odds > 10000) invalid()
        return { matchId, market, pick, line, clientBp: Math.round(odds * 10000) }
    })
    // One pick per match: a multiple cannot combine outcomes of the same game.
    if (new Set(picks.map((p) => p.matchId)).size !== picks.length) invalid()
    return picks
}

async function loadMatch(ctx, matchId) {
    try {
        return (await ctx.sports.match(new URLSearchParams({ id: matchId }))).match
    } catch (error) {
        if (error?.status === 404) return null
        throw new ApiError(503, 'sports_unavailable')
    }
}

// body: { kind, stake (coins), selections: [{ matchId, market, pick, line?, odds }], idempotencyKey }
export async function placeSportsBet(ctx, body) {
    const kind = v.oneOf(body.kind, ['single', 'multiple'], 'invalid_selections')
    const stake = v.stakeCents(body.stake)
    const idem = v.idempotencyKey(body.idempotencyKey)
    const picks = parseSelections(body.selections, kind)

    const replay = await ctx.rpc('find_sports_bet_by_key', { p_user: ctx.userId, p_idem: idem })
    if (replay) return replay

    const matches = await Promise.all(picks.map((p) => loadMatch(ctx, p.matchId)))
    const accepted = picks.map((pick, index) => {
        const match = matches[index]
        if (!match || (match.status?.phase !== 'scheduled' && match.status?.phase !== 'live')) throw new ApiError(409, 'match_closed', { matchId: pick.matchId })
        const wanted = selectionId(pick.market, pick.pick, pick.line)
        const found = (match.markets ?? []).filter((m) => m.key === pick.market).flatMap((m) => m.selections).find((s) => s.id === wanted)
        const currentBp = found ? Math.round(found.odd * 100) * 100 : 0
        if (!found || found.suspended || currentBp <= 10000) {
            throw new ApiError(409, 'market_closed', { matchId: pick.matchId, market: pick.market, pick: pick.pick, line: pick.line })
        }
        return { pick, match, currentBp }
    })

    const changes = accepted.filter((a) => a.currentBp !== a.pick.clientBp)
        .map((a) => ({ matchId: a.pick.matchId, market: a.pick.market, pick: a.pick.pick, line: a.pick.line, odds: a.currentBp / 10000 }))
    if (changes.length) throw new ApiError(409, 'odds_changed', { changes })

    // Exact integers: combined odds in basis points and the payout, both rounded half up.
    const count = BigInt(accepted.length)
    const product = accepted.reduce((total, a) => total * BigInt(a.currentBp), 1n)
    const unit = BP ** (count - 1n)
    const oddsBp = (product * 2n + unit) / (2n * unit)
    const potential = (BigInt(stake) * product * 2n + BP ** count) / (2n * BP ** count)
    if (potential > MAX_PAYOUT_CENTS) v.fail('payout_limit')

    return ctx.rpc('place_sports_bet', {
        p_user: ctx.userId, p_kind: kind, p_stake: stake, p_odds_bp: Number(oddsBp), p_potential: Number(potential),
        p_source: accepted.some((a) => a.match.simulated) ? 'demo' : 'api-football',
        p_selections: accepted.map((a) => ({
            matchId: a.pick.matchId,
            matchLabel: `${a.match.home.name} x ${a.match.away.name}`.slice(0, 160),
            market: a.pick.market,
            selection: a.pick.pick,
            line: a.pick.line,
            selectionLabel: labelOf(a.pick.market, a.pick.pick, a.pick.line, a.match).slice(0, 160),
            oddsBp: a.currentBp,
        })),
        p_idem: idem,
    })
}

// Exact share of the stake each leg result returns, as [numerator, denominator] (src/sports/settlement.js legFactor).
const legFraction = (result, oddsBp) => ({
    won: [BigInt(oddsBp), BP],
    half_won: [BigInt(oddsBp) + BP, 2n * BP],
    void: [1n, 1n],
    half_lost: [1n, 2n],
    lost: [0n, 1n],
})[result]

// Cents, rounded half up, from resolved legs ({ result, oddsBp }).
export function payoutFor(stake, legs) {
    let num = 1n
    let den = 1n
    for (const leg of legs) {
        const [n, d] = legFraction(leg.result, leg.oddsBp)
        num *= n
        den *= d
    }
    return Number((BigInt(stake) * num * 2n + den) / (2n * den))
}

const statusFor = (payout, stake) => (payout === 0 ? 'lost' : payout > stake ? 'won' : payout === stake ? 'void' : 'partial')

// Settles open bets whose legs are all decided: one player's (userId) or everyone's (null, cron).
// Provider failures leave bets open; settle_sports_bet pays at most once, so reruns are harmless.
export async function settleOpenBets(ctx, userId = null, { maxBets = 200, maxMatches = 100 } = {}) {
    const bets = (userId
        ? await ctx.rpc('open_sports_bets', { p_user: userId })
        : await ctx.rpc('open_sports_bets_all', { p_limit: maxBets })).slice(0, maxBets)

    const ids = [...new Set(bets.flatMap((bet) => bet.selections.map((s) => s.matchId)))].slice(0, maxMatches)
    const chunks = []
    for (let i = 0; i < ids.length; i += IDS_PER_CALL) chunks.push(ids.slice(i, i + IDS_PER_CALL))
    const fetched = await Promise.all(chunks.map((chunk) => ctx.sports.matches(new URLSearchParams({ view: 'ids', ids: chunk.join(',') })).catch(() => null)))
    const byId = new Map(fetched.flatMap((r) => r?.matches ?? []).map((m) => [m.id, m]))

    let settled = 0
    for (const bet of bets) {
        try {
            const legs = bet.selections.map((s) => ({
                id: s.id, oddsBp: s.oddsBp, matchId: s.matchId,
                result: settleLeg({ market: s.market, pick: s.selection, line: s.line === null ? null : Number(s.line) }, byId.get(s.matchId), ctx.now()),
            }))
            const lost = legs.some((leg) => leg.result === 'lost')
            if (!lost && legs.some((leg) => leg.result === 'pending')) continue

            const payout = lost ? 0 : payoutFor(bet.stake, legs)
            const outcome = await ctx.rpc('settle_sports_bet', {
                p_bet: bet.id, p_status: statusFor(payout, bet.stake), p_payout: payout,
                p_selections: legs.filter((leg) => leg.result !== 'pending').map((leg) => {
                    const match = byId.get(leg.matchId)
                    return { id: leg.id, status: leg.result, result: { score: match?.score?.ft ?? null, matchStatus: match?.status?.code ?? null } }
                }),
            })
            if (!outcome.replayed) settled += 1
        } catch (error) {
            ctx.logError('sports/settle', error?.code ?? error?.name ?? 'Error', error?.message)
        }
    }
    return { checked: bets.length, settled }
}
