// Server-side simulated sports bets: placing (validation, odds, idempotency) and settlement, against
// the real migrations (PGlite), the Auth emulator and a stubbed sports service.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createAccountApp } from './app.js'
import { payoutFor } from './sports.js'
import { createEmulator } from './testing/emulator.js'
import { createTestDatabase } from './testing/pg.js'
import { selectionId } from '../sports/markets.js'

const ORIGIN = 'https://123bet.test'
const SERVICE_KEY = 'sb_secret_test_service_key_000000000000'
const ANON_KEY = 'sb_publishable_test_anon_key_0000000000'
const CRON_SECRET = 'cron-secret-for-tests-only-000000000000000'
const PASSWORD = 'Senha-forte-2026'

// Stubbed sports service: matches are plain objects the tests mutate.
const market = (key, line, picks) => ({
    key, line, selections: picks.map(([pick, odd, pickLine = line, suspended = false]) => ({ id: selectionId(key, pick, pickLine), pick, line: pickLine, odd, suspended })),
})
const baseMatch = (id, extra = {}) => ({
    id, simulated: true, kickoff: '2026-11-04T20:00:00.000Z',
    home: { name: `Casa ${id}` }, away: { name: `Fora ${id}` },
    status: { code: 'NS', phase: 'scheduled' }, score: { home: 0, away: 0, ft: null }, totals: null,
    markets: [
        market('match_winner', null, [['home', 2.1], ['draw', 3.2], ['away', 3.5]]),
        market('goals_ou', 2.5, [['over', 1.9], ['under', 1.9]]),
        market('asian_handicap', -0.25, [['home', 1.95, -0.25]]),
        market('asian_handicap', 0.25, [['home', 1.8, 0.25, false]]),
        market('btts', null, [['yes', 1.7], ['no', 2.05, null, true]]),
    ],
    ...extra,
})
const finish = (match, home, away) => Object.assign(match, {
    status: { code: 'FT', phase: 'finished' }, score: { home, away, ft: { home, away } }, markets: [],
})

let matches
let sportsDown = false
const sports = {
    async match(params) {
        const found = matches.get(params.get('id'))
        if (!found) throw Object.assign(new Error('Partida não encontrada'), { status: 404 })
        return { meta: { mode: 'demo' }, match: structuredClone(found) }
    },
    async matches(params) {
        if (sportsDown) throw new Error('provider down')
        return { meta: { mode: 'demo' }, matches: params.get('ids').split(',').filter((id) => matches.has(id)).map((id) => structuredClone(matches.get(id))) }
    },
}

let db
let emulator
let app
let ipCounter = 0
let seq = 0
const key = () => `sports-${Date.now().toString(36)}-${(seq += 1).toString().padStart(4, '0')}`

function client() {
    const jar = new Map()
    const ip = `198.51.100.${(ipCounter += 1) % 250}`
    async function call(method, path, body, headers = {}) {
        const sent = { origin: ORIGIN, 'x-requested-with': '123bet', 'x-real-ip': ip, ...headers }
        if (body !== undefined) sent['content-type'] = 'application/json'
        const cookie = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ')
        if (cookie) sent.cookie = cookie
        const response = await app.handle(new Request(`${ORIGIN}/api/app/${path}`, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify(body) }))
        for (const header of response.headers.getSetCookie()) {
            const [pair] = header.split(';')
            const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
            if (/Max-Age=0\b/.test(header) || !value) jar.delete(pair.slice(0, pair.indexOf('=')))
            else jar.set(pair.slice(0, pair.indexOf('=')), value)
        }
        return { status: response.status, data: await response.json() }
    }
    return { get: (path, headers) => call('GET', path, undefined, headers), post: (path, body = {}) => call('POST', path, body) }
}

async function register(name) {
    const c = client()
    const email = `${name}@example.com`
    const signup = await c.post('auth/signup', { email, username: name, fullName: 'Pessoa Teste', password: PASSWORD, passwordConfirm: PASSWORD, acceptTerms: true, acceptPrivacy: true })
    assert.equal(signup.status, 200, JSON.stringify(signup.data))
    const confirm = await c.post('auth/confirm', { tokenHash: emulator.lastLink(email, 'signup') })
    assert.equal(confirm.status, 200, JSON.stringify(confirm.data))
    return c
}

const balance = async (c) => (await c.get('wallet')).data.wallet.balance
const pick = (matchId, market, side, odds, line = null) => ({ matchId, market, pick: side, line, odds })
const bet = (c, selections, stake = '10.00', kind = selections.length > 1 ? 'multiple' : 'single', idempotencyKey = key()) =>
    c.post('sports/bets', { kind, stake, selections, idempotencyKey })
const listBets = async (c, query = '') => (await c.get(`history/sports${query}`)).data

before(async () => {
    db = await createTestDatabase()
    emulator = createEmulator({ db, serviceKey: SERVICE_KEY, anonKey: ANON_KEY })
    app = createAccountApp({
        env: {
            SUPABASE_URL: 'https://emulator.supabase.test', SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
            ACCOUNT_HASH_SECRET: 'hash-secret-for-tests-only-000000000000', CRON_SECRET,
        },
        fetch: emulator.fetch, sports,
    })
})

after(() => db.close())

// Fresh matches per test so settlement in one test never leaks into another.
let n = 1000
const freshMatches = () => {
    matches = new Map()
    const ids = [1, 2, 3].map(() => String((n += 1)))
    for (const id of ids) matches.set(id, baseMatch(id))
    sportsDown = false
    return ids
}

describe('placing bets', () => {
    test('a valid single is priced by the server and debits the stake', async () => {
        const [m1] = freshMatches()
        const c = await register('apostador1')
        const before = await balance(c)
        const res = await bet(c, [pick(m1, 'match_winner', 'home', 2.1)], '10,00')
        assert.equal(res.status, 200, JSON.stringify(res.data))
        assert.equal(res.data.replayed, false)
        const placed = res.data.bet
        assert.deepEqual([placed.kind, placed.stake, placed.oddsBp, placed.potentialPayout, placed.status, placed.dataSource], ['single', 1000, 21000, 2100, 'open', 'demo'])
        assert.deepEqual(placed.selections.map((s) => [s.matchLabel, s.market, s.selection, s.selectionLabel, s.oddsBp]), [[`Casa ${m1} x Fora ${m1}`, 'match_winner', 'home', `Casa ${m1}`, 21000]])
        assert.equal(await balance(c), before - 1000)
        assert.equal(res.data.wallet.balance, before - 1000)
    })

    test('a multiple multiplies the odds in integers and a real provider is labelled api-football', async () => {
        const [m1, m2] = freshMatches()
        matches.get(m1).simulated = false
        matches.get(m2).simulated = false
        const c = await register('apostador2')
        const res = await bet(c, [pick(m1, 'match_winner', 'home', 2.1), pick(m2, 'goals_ou', 'over', 1.9, 2.5)], '10')
        assert.equal(res.status, 200, JSON.stringify(res.data))
        assert.deepEqual([res.data.bet.oddsBp, res.data.bet.potentialPayout, res.data.bet.dataSource], [39900, 3990, 'api-football'])
        const labels = res.data.bet.selections.map((s) => s.selectionLabel).sort()
        assert.deepEqual(labels, [`Casa ${m1}`, 'Mais de 2.5'].sort())
    })

    test('odds that moved are refused with the current odds and nothing is debited', async () => {
        const [m1, m2] = freshMatches()
        const c = await register('apostador3')
        const before = await balance(c)
        matches.get(m1).markets[0].selections[0].odd = 2.2
        const res = await bet(c, [pick(m1, 'match_winner', 'home', 2.1), pick(m2, 'btts', 'yes', 1.7)])
        assert.equal(res.status, 409)
        assert.equal(res.data.error, 'odds_changed')
        assert.deepEqual(res.data.changes, [{ matchId: m1, market: 'match_winner', pick: 'home', line: null, odds: 2.2 }])
        // Forged client odds are just another mismatch.
        const forged = await bet(c, [pick(m2, 'match_winner', 'away', 9.5)])
        assert.equal(forged.data.error, 'odds_changed')
        assert.equal(forged.data.changes[0].odds, 3.5)
        assert.equal(await balance(c), before)
        assert.equal((await bet(c, [pick(m1, 'match_winner', 'home', 2.2)])).status, 200)
    })

    test('unknown or closed markets, unknown lines and suspended picks are refused', async () => {
        const [m1] = freshMatches()
        const c = await register('apostador4')
        const code = async (selection) => { const r = await bet(c, [selection]); return [r.status, r.data.error] }
        assert.deepEqual(await code(pick(m1, 'exact_score', 'home', 2)), [400, 'invalid_selections'])
        assert.deepEqual(await code(pick(m1, 'corners_ou', 'over', 1.9, 9.5)), [409, 'market_closed'])
        assert.deepEqual(await code(pick(m1, 'goals_ou', 'over', 1.9, 3.5)), [409, 'market_closed'])
        assert.deepEqual(await code(pick(m1, 'goals_ou', 'draw', 1.9, 2.5)), [409, 'market_closed'])
        assert.deepEqual(await code(pick(m1, 'btts', 'no', 2.05)), [409, 'market_closed'])
        assert.deepEqual(await code(pick(m1, 'match_winner', 'home', 2.1, 1)), [409, 'market_closed'])
        assert.deepEqual(await code({ matchId: m1, market: 'match_winner', pick: 'home' }), [400, 'invalid_selections'])
        assert.deepEqual(await code(pick('not-a-match', 'match_winner', 'home', 2.1)), [400, 'invalid_selections'])
    })

    test('finished, cancelled and missing matches are closed for betting', async () => {
        const [m1, m2] = freshMatches()
        finish(matches.get(m1), 1, 0)
        matches.get(m2).status = { code: 'PST', phase: 'cancelled' }
        const c = await register('apostador5')
        for (const id of [m1, m2, '999999']) {
            const res = await bet(c, [pick(id, 'match_winner', 'home', 2.1)])
            assert.deepEqual([res.status, res.data.error], [409, 'match_closed'])
        }
        // A live match with open markets is still bettable (same rule as the slip).
        const [live] = freshMatches()
        matches.get(live).status = { code: '1H', phase: 'live' }
        assert.equal((await bet(c, [pick(live, 'match_winner', 'home', 2.1)])).status, 200)
    })

    test('stake, shape and balance checks', async () => {
        const [m1, m2] = freshMatches()
        const c = await register('apostador6')
        const home = pick(m1, 'match_winner', 'home', 2.1)
        const err = async (promise) => (await promise).data.error
        assert.equal(await err(bet(c, [home], '0.05')), 'invalid_stake')
        assert.equal(await err(bet(c, [home], '10001')), 'invalid_stake')
        assert.equal(await err(bet(c, [home], '1e3')), 'invalid_stake')
        assert.equal(await err(bet(c, [home], '10', 'single', 'x')), 'invalid_idempotency_key')
        assert.equal(await err(bet(c, [home], '10', 'combo')), 'invalid_selections')
        assert.equal(await err(bet(c, [home, pick(m2, 'btts', 'yes', 1.7)], '10', 'single')), 'invalid_selections')
        assert.equal(await err(bet(c, [home], '10', 'multiple')), 'invalid_selections')
        assert.equal(await err(bet(c, [home, pick(m1, 'btts', 'yes', 1.7)], '10', 'multiple')), 'invalid_selections')
        assert.equal(await err(c.post('sports/bets', { kind: 'single', stake: '10', selections: 'x', idempotencyKey: key() })), 'invalid_selections')
        const own = await balance(c)
        assert.equal(await err(bet(c, [home], String(Math.floor(own / 100) + 1))), 'insufficient_funds')
        assert.equal((await client().post('sports/bets', {})).data.error, 'unauthenticated')
    })

    test('an idempotent replay returns the original bet even after the odds moved', async () => {
        const [m1] = freshMatches()
        const c = await register('apostador7')
        const before = await balance(c)
        const idem = key()
        const first = await bet(c, [pick(m1, 'match_winner', 'home', 2.1)], '10', 'single', idem)
        matches.get(m1).markets[0].selections[0].odd = 1.5
        finish(matches.get(m1), 0, 0)
        const replay = await bet(c, [pick(m1, 'match_winner', 'home', 2.1)], '10', 'single', idem)
        assert.equal(replay.status, 200)
        assert.equal(replay.data.replayed, true)
        assert.equal(replay.data.bet.id, first.data.bet.id)
        assert.equal(await balance(c), before - 1000)
        assert.equal((await listBets(c)).items.length, 1)
    })
})

describe('settlement', () => {
    const place = async (c, selections, stake = '10', kind) => {
        const res = await bet(c, selections, stake, kind)
        assert.equal(res.status, 200, JSON.stringify(res.data))
        return res.data.bet
    }

    test('won, lost and void singles settle lazily when the player lists bets', async () => {
        const [m1, m2, m3] = freshMatches()
        const c = await register('liquida1')
        const won = await place(c, [pick(m1, 'match_winner', 'home', 2.1)])
        const lost = await place(c, [pick(m2, 'match_winner', 'home', 2.1)])
        const voided = await place(c, [pick(m3, 'match_winner', 'home', 2.1)])
        const staked = await balance(c)

        // Nothing has finished: still open, still listed, no money moved.
        assert.deepEqual((await listBets(c)).items.map((b) => b.status), ['open', 'open', 'open'])
        finish(matches.get(m1), 2, 1)
        finish(matches.get(m2), 0, 1)
        Object.assign(matches.get(m3), { status: { code: 'PST', phase: 'cancelled' } })

        const list = await listBets(c)
        const byId = new Map(list.items.map((b) => [b.id, b]))
        assert.deepEqual([byId.get(won.id).status, byId.get(won.id).payout], ['won', 2100])
        assert.deepEqual([byId.get(lost.id).status, byId.get(lost.id).payout], ['lost', 0])
        assert.deepEqual([byId.get(voided.id).status, byId.get(voided.id).payout], ['void', 1000])
        assert.deepEqual(byId.get(won.id).selections.map((s) => s.status), ['won'])
        assert.deepEqual(byId.get(won.id).selections[0].result.score, { home: 2, away: 1 })
        assert.equal(await balance(c), staked + 2100 + 1000)

        // Settle once: more listings change nothing.
        await listBets(c)
        await listBets(c, '?status=won')
        assert.equal(await balance(c), staked + 3100)
        const types = (await c.get('wallet/transactions')).data.items.filter((t) => t.origin === 'sports').map((t) => t.type).sort()
        assert.deepEqual(types, ['bet', 'bet', 'bet', 'refund', 'win'])
    })

    test('quarter lines pay half: half won above the stake, half lost as a partial return', async () => {
        const [m1, m2] = freshMatches()
        const c = await register('liquida2')
        // Draw 1-1. Home +0.25 -> half won (stake 10 at 1.80: 10 x 1.4 = 14). Home -0.25 -> half lost (5).
        const halfWon = await place(c, [pick(m1, 'asian_handicap', 'home', 1.8, 0.25)])
        const halfLost = await place(c, [pick(m2, 'asian_handicap', 'home', 1.95, -0.25)])
        finish(matches.get(m1), 1, 1)
        finish(matches.get(m2), 1, 1)
        const byId = new Map((await listBets(c)).items.map((b) => [b.id, b]))
        assert.deepEqual([byId.get(halfWon.id).status, byId.get(halfWon.id).payout, byId.get(halfWon.id).selections[0].status], ['won', 1400, 'half_won'])
        assert.deepEqual([byId.get(halfLost.id).status, byId.get(halfLost.id).payout, byId.get(halfLost.id).selections[0].status], ['partial', 500, 'half_lost'])
    })

    test('a multiple waits for every leg, but one lost leg settles it at once', async () => {
        const [m1, m2, m3] = freshMatches()
        const c = await register('liquida3')
        const waiting = await place(c, [pick(m1, 'match_winner', 'home', 2.1), pick(m2, 'goals_ou', 'over', 1.9, 2.5)])
        const doomed = await place(c, [pick(m1, 'btts', 'yes', 1.7), pick(m3, 'match_winner', 'home', 2.1)])
        finish(matches.get(m1), 1, 0)
        let byId = new Map((await listBets(c)).items.map((b) => [b.id, b]))
        assert.equal(byId.get(waiting.id).status, 'open')
        assert.equal(byId.get(doomed.id).status, 'lost')
        assert.equal(byId.get(doomed.id).payout, 0)

        finish(matches.get(m2), 2, 1)
        byId = new Map((await listBets(c)).items.map((b) => [b.id, b]))
        assert.deepEqual([byId.get(waiting.id).status, byId.get(waiting.id).payout], ['won', 3990])
        assert.equal((await listBets(c, '?status=open')).items.length, 0)
    })

    test('the cron settles every player, and a provider outage leaves bets open without breaking the listing', async () => {
        const [m1] = freshMatches()
        const a = await register('liquida4')
        const b = await register('liquida5')
        await place(a, [pick(m1, 'match_winner', 'home', 2.1)])
        await place(b, [pick(m1, 'match_winner', 'away', 3.5)])
        const [balA, balB] = [await balance(a), await balance(b)]
        finish(matches.get(m1), 1, 0)

        sportsDown = true
        const down = await a.get('history/sports')
        assert.equal(down.status, 200)
        assert.equal(down.data.items[0].status, 'open')

        sportsDown = false
        assert.equal((await client().get('cron/maintenance')).status, 401)
        const cron = await client().get('cron/maintenance', { authorization: `Bearer ${CRON_SECRET}` })
        assert.equal(cron.status, 200, JSON.stringify(cron.data))
        assert.ok(cron.data.sports.settled >= 2)
        assert.equal(await balance(a), balA + 2100)
        assert.equal(await balance(b), balB)
        assert.equal((await listBets(b)).items[0].status, 'lost')
        const again = await client().get('cron/maintenance', { authorization: `Bearer ${CRON_SECRET}` })
        assert.equal(again.data.sports.settled, 0)
        assert.equal(await balance(a), balA + 2100)
    })

    test('payoutFor rounds half up in exact integers', () => {
        const leg = (result, oddsBp) => ({ result, oddsBp })
        assert.equal(payoutFor(333, [leg('won', 15000)]), 500) // 499.5
        assert.equal(payoutFor(1000, [leg('won', 21000), leg('won', 19000)]), 3990)
        assert.equal(payoutFor(1000, [leg('won', 21000), leg('void', 19000)]), 2100)
        assert.equal(payoutFor(1000, [leg('half_won', 18000)]), 1400)
        assert.equal(payoutFor(1000, [leg('half_lost', 18000), leg('lost', 18000)]), 0)
        assert.equal(payoutFor(10, [leg('half_lost', 18000)]), 5)
    })
})
