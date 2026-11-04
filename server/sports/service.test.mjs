import assert from 'node:assert/strict'
import test from 'node:test'
import { clearCache } from './cache.js'
import { handle } from './http.js'
import { createSportsService } from './service.js'

const NOW = Date.parse('2026-11-04T19:30:00Z')
const TODAY = '2026-11-04'
const query = (params) => new URLSearchParams(params)
const request = (path) => new Request(`http://localhost/api/sports/${path}`)

test('demo mode is deterministic and labelled as simulated', async () => {
    const service = createSportsService({ env: {}, now: () => NOW })
    const first = await service.matches(query({ view: 'date', date: TODAY }))
    const second = await createSportsService({ env: {}, now: () => NOW }).matches(query({ view: 'date', date: TODAY }))
    assert.deepEqual(first.matches, second.matches)
    assert.equal(first.meta.mode, 'demo')
    assert.equal(first.meta.simulated, true)
    assert.ok(first.matches.length >= 20)
    assert.ok(first.matches.every((m) => m.simulated === true))
    assert.ok(first.matches.some((m) => m.league.id === '71') && first.matches.some((m) => m.league.id === '2'))
})

test('demo matches move through the whole match clock', async () => {
    const service = createSportsService({ env: {}, now: () => NOW })
    const scheduled = (await service.matches(query({ view: 'date', date: TODAY }))).matches.find((m) => m.status.phase === 'scheduled')
    const kickoff = Date.parse(scheduled.kickoff)
    const at = async (minutes) => (await createSportsService({ env: {}, now: () => kickoff + minutes * 60000 }).match(query({ id: scheduled.id }))).match
    assert.equal((await at(-1)).status.code, 'NS')
    assert.deepEqual([(await at(10)).status.code, (await at(10)).status.elapsed], ['1H', 11])
    assert.equal((await at(50)).status.code, 'HT')
    assert.deepEqual([(await at(70)).status.code, (await at(70)).status.elapsed], ['2H', 54])
    const ended = await at(120)
    assert.equal(ended.status.code, 'FT')
    assert.deepEqual(ended.score.ft, { home: ended.score.home, away: ended.score.away })
    assert.ok(ended.totals.corners && ended.totals.cards)
    assert.deepEqual(ended.markets, [])

    const before = await at(-1)
    const keys = new Set(before.markets.map((m) => m.key))
    for (const key of ['match_winner', 'goals_ou', 'btts', 'asian_handicap', 'handicap_3way', 'corners_ou', 'cards_ou']) assert.ok(keys.has(key), key)
    assert.ok(before.markets.every((m) => m.selections.every((s) => s.odd >= 1.01 && s.odd <= 41)))
})

test('input validation rejects bad dates, ids and views', async () => {
    const service = createSportsService({ env: {}, now: () => NOW })
    await assert.rejects(service.matches(query({ view: 'date', date: '2026-12-01' })), /7 dias/)
    await assert.rejects(service.matches(query({ view: 'ids', ids: 'abc' })), /ids/)
    await assert.rejects(service.matches(query({ view: 'ids', ids: Array.from({ length: 21 }, (_, i) => i + 1).join(',') })), /ids/)
    await assert.rejects(service.matches(query({ view: 'everything' })), /inválida/)
    await assert.rejects(service.match(query({ id: '../etc' })), /inválido/)
})

// ---------- API-Football adapter with a fake provider ----------

const KEY = 'test-key-123'

function fakeApi(routes) {
    const calls = []
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), headers: init.headers })
        const route = routes.find(([prefix]) => String(url).startsWith(`https://v3.football.api-sports.io${prefix}`))
        const [, body, status = 200, headers = {}] = route ?? ['', { errors: [], response: [] }]
        return new Response(JSON.stringify(body), { status, headers: { 'x-ratelimit-requests-remaining': '7400', 'x-ratelimit-remaining': '290', ...headers } })
    }
    return { calls, fetchImpl }
}

const fixture = (id, short, goals, extra = {}) => ({
    fixture: { id, timestamp: 1793833200, date: '2026-11-04T21:00:00-03:00', status: { short, elapsed: short === 'NS' ? null : 67 }, venue: { name: 'Maracanã' }, referee: 'Árbitro Teste' },
    league: { id: 71, name: 'Serie A', country: 'Brazil', logo: 'https://media.example/71.png', season: 2026, round: 'Regular Season - 33' },
    teams: { home: { id: 127, name: 'Flamengo', logo: 'https://media.example/127.png' }, away: { id: 121, name: 'Palmeiras', logo: 'https://media.example/121.png' } },
    goals,
    score: { halftime: { home: 0, away: 0 }, fulltime: { home: null, away: null } },
    ...extra,
})

test('live view: normalised fixtures plus in-play match odds, key only in the request header', async () => {
    clearCache()
    const { calls, fetchImpl } = fakeApi([
        ['/fixtures?live=all', { errors: [], response: [fixture(1001, '2H', { home: 1, away: 0 })] }],
        ['/odds/live', { errors: [], response: [{ fixture: { id: 1001 }, status: { stopped: false, blocked: false }, odds: [{ id: 59, name: 'Fulltime Result', values: [{ value: 'Home', odd: '1.40' }, { value: 'Draw', odd: '4.20' }, { value: 'Away', odd: '8.50' }] }] }] }],
    ])
    const response = await handle(request('matches?view=live'), 'matches', createSportsService({ env: { API_FOOTBALL_KEY: KEY }, fetchImpl, now: () => NOW }))
    const text = await response.text()
    const body = JSON.parse(text)

    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /s-maxage=20/)
    assert.ok(!text.includes(KEY))
    assert.ok(calls.every((c) => c.headers['x-apisports-key'] === KEY))
    assert.equal(body.meta.mode, 'api-football')
    assert.equal(body.meta.quotaRemaining, 7400)
    const [match] = body.matches
    assert.equal(match.league.name, 'Brasileirão Série A')
    assert.equal(match.status.phase, 'live')
    assert.deepEqual([match.score.home, match.score.away], [1, 0])
    assert.equal(match.home.logo, 'https://media.example/127.png')
    assert.deepEqual(match.odds.main.selections.map((s) => s.odd), [1.4, 4.2, 8.5])
})

test('match detail after extra time settles on the 90-minute score and reads statistics', async () => {
    clearCache()
    const item = fixture(2002, 'AET', { home: 2, away: 1 }, {
        score: { halftime: { home: 0, away: 1 }, fulltime: { home: 1, away: 1 }, extratime: { home: 1, away: 0 } },
        statistics: [
            { team: { id: 127 }, statistics: [{ type: 'Corner Kicks', value: 7 }, { type: 'Yellow Cards', value: 2 }, { type: 'Red Cards', value: null }, { type: 'Ball Possession', value: '58%' }] },
            { team: { id: 121 }, statistics: [{ type: 'Corner Kicks', value: 3 }, { type: 'Yellow Cards', value: 4 }, { type: 'Red Cards', value: 1 }, { type: 'Ball Possession', value: '42%' }] },
        ],
        events: [{ time: { elapsed: 23, extra: null }, team: { id: 121 }, player: { name: 'Jogador B' }, assist: { name: null }, type: 'Goal', detail: 'Normal Goal' }],
    })
    const { calls, fetchImpl } = fakeApi([['/fixtures?id=2002', { errors: [], response: [item] }]])
    const { match, maxAge } = await createSportsService({ env: { API_FOOTBALL_KEY: KEY }, fetchImpl, now: () => NOW }).match(query({ id: '2002' }))

    assert.equal(match.status.phase, 'finished')
    assert.deepEqual(match.score.ft, { home: 1, away: 1 })
    assert.deepEqual(match.totals, { corners: { home: 7, away: 3 }, cards: { home: 2, away: 5 } })
    assert.deepEqual(match.stats.find((s) => s.key === 'possession'), { key: 'possession', label: 'Posse de bola', home: 58, away: 42, unit: '%' })
    assert.deepEqual(match.events[0], { minute: 23, extra: null, team: 'away', type: 'goal', player: 'Jogador B', detail: null })
    assert.deepEqual(match.markets, [])
    assert.equal(maxAge, 3600)
    assert.equal(calls.length, 1, 'finished matches need no odds request')
})

test('provider quota errors become a 503 without leaking provider details', async () => {
    clearCache()
    const { fetchImpl } = fakeApi([['/fixtures', { errors: { requests: 'You have reached the request limit for the day' }, response: [] }]])
    const response = await handle(request('matches?view=live'), 'matches', createSportsService({ env: { API_FOOTBALL_KEY: KEY }, fetchImpl, now: () => NOW }))
    const body = await response.json()
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('retry-after'), '60')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(body.error, 'Limite de requisições do fornecedor atingido')
})

test('lookups by id cannot drain the provider quota', async () => {
    clearCache()
    const { calls, fetchImpl } = fakeApi([['/fixtures', { errors: [], response: [fixture(4004, 'FT', { home: 1, away: 0 })] }]])
    const service = createSportsService({ env: { API_FOOTBALL_KEY: KEY }, fetchImpl, now: () => NOW })
    const results = await Promise.allSettled(Array.from({ length: 125 }, (_, i) => service.match(query({ id: String(5000 + i) }))))
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 120, 'per-minute cap per instance')
    assert.match(results.at(-1).reason.message, /limitadas/)
    assert.equal(calls.length, 120)

    clearCache()
    const low = fakeApi([['/fixtures', { errors: [], response: [fixture(4005, 'FT', { home: 1, away: 0 })] }, 200, { 'x-ratelimit-requests-remaining': '50' }]])
    const lowService = createSportsService({ env: { API_FOOTBALL_KEY: KEY }, fetchImpl: low.fetchImpl, now: () => NOW })
    await lowService.match(query({ id: '6001' }))
    await assert.rejects(lowService.match(query({ id: '6002' })), /limitadas/)
    assert.equal((await lowService.matches(query({ view: 'live' }))).view, 'live', 'shared lists keep the reserved quota')
})

test('each visitor is rate limited per minute', async () => {
    const service = createSportsService({ env: {}, now: () => NOW })
    const visit = () => handle(new Request('http://localhost/api/sports/matches?view=live', { headers: { 'x-real-ip': '203.0.113.9' } }), 'matches', service)
    for (let i = 0; i < 60; i++) assert.equal((await visit()).status, 200)
    const blocked = await visit()
    assert.equal(blocked.status, 429)
    assert.equal(blocked.headers.get('retry-after'), '60')
    const other = await handle(new Request('http://localhost/api/sports/matches?view=live', { headers: { 'x-real-ip': '198.51.100.7' } }), 'matches', service)
    assert.equal(other.status, 200)
})

test('a burst of identical requests reaches the provider once', async () => {
    clearCache()
    const { calls, fetchImpl } = fakeApi([['/fixtures?date=', { errors: [], response: [fixture(3003, 'FT', { home: 0, away: 0 })] }]])
    const service = createSportsService({ env: { API_FOOTBALL_KEY: KEY }, fetchImpl, now: () => NOW })
    await Promise.all(Array.from({ length: 5 }, () => service.matches(query({ view: 'date', date: TODAY }))))
    assert.equal(calls.filter((c) => c.url.includes('/fixtures?date=')).length, 1)
})
