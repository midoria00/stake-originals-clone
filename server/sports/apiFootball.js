// API-Football v3 adapter (real data). Field names follow the v3 API as commonly documented; the
// official docs were behind a bot challenge during research (docs/sports-data-providers.md), so the
// contract tests in this folder encode our assumptions. Validate with a real key before production.
import { memo } from './cache.js'
import { describeLeague } from './leagues.js'
import { describeStatus } from './status.js'
import { marketsFromBookmakers, normalizeBets } from './markets.js'

const BASE_URL = 'https://v3.football.api-sports.io'
const TIMEZONE = 'America/Sao_Paulo'
// Bet365, Pinnacle, 1xBet, Bwin, Unibet: only used to order bookmakers, any other one is still accepted.
const BOOKMAKER_PRIORITY = [8, 4, 11, 6, 16]
const MATCH_WINNER_BET = 1
const IDS_PER_CALL = 20
const LOW_QUOTA = 150
const RESERVED_FOR_LISTS = 100
// API-Football Pro allows 300 requests/minute (docs/sports-data-providers.md).
const UPSTREAM_PER_MINUTE = 120
// Part of each minute that lookups by id can never use, so the shared live/date lists keep working.
const LIST_RESERVE_PER_MINUTE = 40
// Live every 20 s (2 calls, ~8,600/day) + today's list and league odds + match pages.
const DAILY_CALLS_AT_DEFAULT_TTL = 12_000

export class ProviderError extends Error {
    constructor(message, { status = 502, quota = false } = {}) {
        super(message)
        this.status = status
        this.quota = quota
        this.expose = true
    }
}

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return null
    const number = Number(String(value).replace('%', ''))
    return Number.isFinite(number) ? number : null
}

const pair = (value) => (value && value.home !== null && value.home !== undefined && value.away !== null && value.away !== undefined
    ? { home: value.home, away: value.away }
    : null)

const STAT_TYPES = {
    'Ball Possession': ['possession', 'Posse de bola', '%'],
    'Total Shots': ['shots', 'Finalizações'],
    'Shots on Goal': ['shotsOnTarget', 'Finalizações no alvo'],
    'Corner Kicks': ['corners', 'Escanteios'],
    'Yellow Cards': ['yellow', 'Cartões amarelos'],
    'Red Cards': ['red', 'Cartões vermelhos'],
    Fouls: ['fouls', 'Faltas'],
    Offsides: ['offsides', 'Impedimentos'],
    'Goalkeeper Saves': ['saves', 'Defesas do goleiro'],
    expected_goals: ['xg', 'Gols esperados (xG)'],
}

export function normalizeStatistics(statistics, teams) {
    if (!Array.isArray(statistics) || statistics.length < 2) return null
    const side = (teamId) => new Map((statistics.find((s) => s.team?.id === teamId)?.statistics ?? []).map((s) => [s.type, s.value]))
    const home = side(teams.home.id)
    const away = side(teams.away.id)
    const list = []
    for (const [type, [key, label, unit]] of Object.entries(STAT_TYPES)) {
        if (!home.has(type) && !away.has(type)) continue
        // The API sends null for zero counts (e.g. no red cards).
        list.push({ key, label, home: toNumber(home.get(type)) ?? 0, away: toNumber(away.get(type)) ?? 0, ...(unit ? { unit } : {}) })
    }
    const get = (key) => list.find((s) => s.key === key)
    const corners = get('corners')
    const yellow = get('yellow')
    const red = get('red')
    return {
        list,
        totals: {
            corners: corners ? { home: corners.home, away: corners.away } : null,
            cards: yellow || red ? { home: (yellow?.home ?? 0) + (red?.home ?? 0), away: (yellow?.away ?? 0) + (red?.away ?? 0) } : null,
        },
    }
}

export function normalizeEvents(events, teams) {
    return (events ?? [])
        .map((event) => {
            const detail = String(event.detail ?? '')
            let type = null
            if (event.type === 'Goal') {
                type = /own goal/i.test(detail) ? 'own_goal' : /missed penalty/i.test(detail) ? 'missed_penalty' : /penalty/i.test(detail) ? 'penalty' : 'goal'
            } else if (event.type === 'Card') {
                type = /red|second yellow/i.test(detail) ? 'red' : 'yellow'
            } else if (/subst/i.test(event.type ?? '')) {
                type = 'sub'
            } else if (/var/i.test(event.type ?? '')) {
                type = 'var'
            }
            if (!type) return null
            return {
                minute: event.time?.elapsed ?? null,
                extra: event.time?.extra ?? null,
                team: event.team?.id === teams.home.id ? 'home' : 'away',
                type,
                player: event.player?.name ?? null,
                detail: type === 'sub' ? (event.assist?.name ? `Sai ${event.assist.name}` : null) : (event.assist?.name ? `Assistência: ${event.assist.name}` : null),
            }
        })
        .filter(Boolean)
}

export function normalizeFixture(item) {
    const { fixture, league, teams, goals, score } = item
    const status = describeStatus(fixture.status?.short, fixture.status?.elapsed, fixture.status?.extra)
    const stats = normalizeStatistics(item.statistics, teams)
    return {
        id: String(fixture.id),
        simulated: false,
        league: describeLeague(league.id, { name: league.name, country: league.country, logo: league.logo, flag: league.flag, round: league.round }),
        kickoff: fixture.timestamp ? new Date(fixture.timestamp * 1000).toISOString() : fixture.date,
        status,
        home: { id: String(teams.home.id), name: teams.home.name, logo: teams.home.logo ?? null },
        away: { id: String(teams.away.id), name: teams.away.name, logo: teams.away.logo ?? null },
        score: {
            home: goals?.home ?? null,
            away: goals?.away ?? null,
            ht: pair(score?.halftime),
            // Bets settle on regular time: `score.fulltime` is the 90-minute score even after extra time.
            ft: status.phase === 'finished' ? pair(score?.fulltime) ?? pair(goals) : null,
        },
        totals: stats?.totals ?? null,
        odds: { main: null, live: status.phase === 'live', source: null },
        venue: fixture.venue?.name ?? null,
        referee: fixture.referee ?? null,
    }
}

function liveMarkets(item) {
    const blocked = Boolean(item?.status?.blocked || item?.status?.stopped)
    const bets = (item?.odds ?? []).map((bet) => ({
        ...bet,
        values: (bet.values ?? []).map((v) => ({ ...v, suspended: blocked || Boolean(v.suspended) })),
    }))
    return normalizeBets(bets, 'API-Football (ao vivo)')
}

export function createApiFootballProvider({ key, fetchImpl = fetch, upstreamPerMinute = UPSTREAM_PER_MINUTE }) {
    const quota = { day: null, minute: null, limit: null }
    const quotaLow = () => quota.day !== null && quota.day < LOW_QUOTA
    // Fit the cache to the plan: the default TTLs need ~DAILY_CALLS_AT_DEFAULT_TTL calls a day with
    // visitors around the clock, so smaller plans refresh proportionally less often (Pro ~1.6x),
    // and every TTL stretches 4x more once the day's quota is nearly gone.
    const ttlFactor = () => Math.max(1, quota.limit ? DAILY_CALLS_AT_DEFAULT_TTL / quota.limit : 1) * (quotaLow() ? 4 : 1)
    let window = { start: 0, count: 0 }

    // Ids come from visitors, so lookups by id can always miss the cache. Cap upstream calls per
    // instance (exceeding the provider's per-minute limit can get the key blocked) and keep the
    // last part of the daily quota for the shared list views.
    function admit(params) {
        const now = Date.now()
        if (now - window.start >= 60_000) window = { start: now, count: 0 }
        if (window.count >= upstreamPerMinute) return false
        const byId = 'id' in params || 'ids' in params || 'fixture' in params
        if (byId && window.count >= upstreamPerMinute - LIST_RESERVE_PER_MINUTE) return false
        if (byId && quota.day !== null && quota.day < RESERVED_FOR_LISTS) return false
        window.count += 1
        return true
    }

    function call(path, params, ttlMs) {
        const url = new URL(path, BASE_URL)
        for (const [name, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) url.searchParams.set(name, String(value))
        }
        return memo(`af:${url.pathname}${url.search}`, ttlMs * ttlFactor(), async () => {
            if (!admit(params)) throw new ProviderError('Consultas ao fornecedor temporariamente limitadas', { status: 503, quota: true })
            let response
            try {
                response = await fetchImpl(url, { headers: { 'x-apisports-key': key, accept: 'application/json' } })
            } catch {
                throw new ProviderError('Fornecedor de dados indisponível no momento')
            }
            const day = toNumber(response.headers.get('x-ratelimit-requests-remaining'))
            const minute = toNumber(response.headers.get('x-ratelimit-remaining'))
            const limit = toNumber(response.headers.get('x-ratelimit-requests-limit'))
            if (day !== null) quota.day = day
            if (minute !== null) quota.minute = minute
            if (limit) quota.limit = limit
            if (response.status === 429) throw new ProviderError('Limite de requisições do fornecedor atingido', { status: 503, quota: true })
            if (!response.ok) throw new ProviderError(`Fornecedor de dados respondeu ${response.status}`)
            const body = await response.json()
            const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors ?? {})
            if (errors.length) {
                const text = errors.map(String).join(' ')
                if (/limit|too many|rate/i.test(text)) throw new ProviderError('Limite de requisições do fornecedor atingido', { status: 503, quota: true })
                if (/key|token|subscri/i.test(text)) throw new ProviderError('Chave do fornecedor de dados inválida ou sem acesso')
                throw new ProviderError('Erro do fornecedor de dados')
            }
            return body
        })
    }

    async function pages(path, params, ttlMs, maxPages = 3) {
        const first = await call(path, params, ttlMs)
        const total = Math.min(first.paging?.total ?? 1, maxPages)
        const rest = await Promise.all(Array.from({ length: total - 1 }, (_, i) => call(path, { ...params, page: i + 2 }, ttlMs)))
        return [first, ...rest].flatMap((body) => body.response ?? [])
    }

    async function withStatsFallback(items) {
        // Some plans/endpoints may omit statistics; finished matches need them to settle corners/cards bets.
        const missing = items.filter((item) => item.statistics === undefined && describeStatus(item.fixture.status?.short).phase === 'finished').slice(0, 5)
        await Promise.all(missing.map(async (item) => {
            const body = await call('/fixtures/statistics', { fixture: item.fixture.id }, 3_600_000).catch(() => null)
            item.statistics = body?.response ?? []
        }))
        return items
    }

    return {
        mode: 'api-football',
        source: 'API-Football',
        quotaLow,
        quota: () => ({ ...quota }),

        async live() {
            const [fixtures, odds] = await Promise.all([
                call('/fixtures', { live: 'all', timezone: TIMEZONE }, 20_000),
                call('/odds/live', {}, 20_000).catch(() => null),
            ])
            const mainOdds = new Map((odds?.response ?? []).map((item) => [String(item.fixture?.id), liveMarkets(item).find((m) => m.key === 'match_winner') ?? null]))
            return (fixtures.response ?? []).map((item) => {
                const match = normalizeFixture(item)
                const main = mainOdds.get(match.id) ?? null
                return { ...match, odds: { main, live: true, source: main ? 'API-Football (ao vivo)' : null } }
            })
        },

        async byDate(date, { isToday }) {
            const items = (await call('/fixtures', { date, timezone: TIMEZONE }, isToday ? 60_000 : 600_000)).response ?? []
            const matches = items.map(normalizeFixture)
            // One odds request per featured league with upcoming matches that day (Match Winner only).
            const leagues = new Map()
            items.forEach((item, index) => {
                if (matches[index].league.featured && matches[index].status.phase === 'scheduled') leagues.set(item.league.id, item.league.season)
            })
            const oddsItems = (await Promise.all([...leagues].map(([league, season]) =>
                pages('/odds', { league, season, date, bet: MATCH_WINNER_BET, timezone: TIMEZONE }, 900_000).catch(() => [])))).flat()
            const mainOdds = new Map(oddsItems.map((item) => {
                const main = marketsFromBookmakers(item.bookmakers, BOOKMAKER_PRIORITY).find((m) => m.key === 'match_winner') ?? null
                return [String(item.fixture?.id), main]
            }))
            return matches.map((match) => {
                const main = match.status.phase === 'scheduled' ? mainOdds.get(match.id) ?? null : null
                return main ? { ...match, odds: { main, live: false, source: main.source } } : match
            })
        },

        async byIds(ids) {
            const chunks = []
            for (let i = 0; i < ids.length; i += IDS_PER_CALL) chunks.push(ids.slice(i, i + IDS_PER_CALL))
            const items = (await Promise.all(chunks.map((chunk) => call('/fixtures', { ids: chunk.join('-'), timezone: TIMEZONE }, 30_000)))).flatMap((body) => body.response ?? [])
            return (await withStatsFallback(items)).map(normalizeFixture)
        },

        async match(id) {
            const item = (await call('/fixtures', { id, timezone: TIMEZONE }, 20_000)).response?.[0]
            if (!item) return null
            const base = normalizeFixture(item)
            const phase = base.status.phase
            const needsDetail = phase !== 'scheduled' && (item.statistics === undefined || item.events === undefined)
            const [statistics, events, markets] = await Promise.all([
                needsDetail && item.statistics === undefined ? call('/fixtures/statistics', { fixture: id }, 20_000).then((b) => b.response).catch(() => []) : item.statistics,
                needsDetail && item.events === undefined ? call('/fixtures/events', { fixture: id }, 20_000).then((b) => b.response).catch(() => []) : item.events,
                phase === 'live'
                    ? call('/odds/live', { fixture: id }, 20_000).then((b) => liveMarkets(b.response?.[0])).catch(() => [])
                    : phase === 'scheduled'
                        ? call('/odds', { fixture: id, timezone: TIMEZONE }, 300_000).then((b) => marketsFromBookmakers(b.response?.[0]?.bookmakers, BOOKMAKER_PRIORITY)).catch(() => [])
                        : [],
            ])
            const stats = normalizeStatistics(statistics, item.teams)
            const main = markets.find((m) => m.key === 'match_winner') ?? null
            return {
                ...base,
                totals: stats?.totals ?? base.totals,
                odds: { main, live: phase === 'live', source: main?.source ?? null },
                markets,
                stats: stats?.list ?? [],
                events: normalizeEvents(events, item.teams),
            }
        },
    }
}
