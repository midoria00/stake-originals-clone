// End-to-end tests of the account API against the real migrations (PGlite) and an Auth emulator.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createAccountApp } from './app.js'
import { createEmulator } from './testing/emulator.js'
import { createTestDatabase } from './testing/pg.js'
import { signSandboxEvent } from './payments.js'

const ORIGIN = 'https://123bet.test'
const SERVICE_KEY = 'sb_secret_test_service_key_000000000000'
const ANON_KEY = 'sb_publishable_test_anon_key_0000000000'
const SANDBOX_SECRET = 'sandbox-webhook-secret-for-tests-only-0000'
const CRON_SECRET = 'cron-secret-for-tests-only-000000000000000'

let db
let emulator
let app
let offset = 0
const now = () => Date.now() + offset
const floats = []
const ints = []
// Simulates Supabase Auth answering the token endpoint with this status (429: shared IP budget spent).
let tokenOutage = 0
let refreshCalls = 0
// Delays settle_round (the crash/payout path) to reproduce interleaved requests.
let settleDelayMs = 0
const authFetch = async (target, init) => {
    if (settleDelayMs && String(target).endsWith('/rest/v1/rpc/settle_round')) await new Promise((resolve) => setTimeout(resolve, settleDelayMs))
    if (String(target).includes('/auth/v1/token') && String(target).includes('refresh_token')) {
        refreshCalls += 1
        if (tokenOutage) return Promise.resolve(new Response(JSON.stringify({ msg: 'unavailable' }), { status: tokenOutage, headers: { 'content-type': 'application/json' } }))
    }
    return emulator.fetch(target, init)
}
const rng = { float: () => floats.shift() ?? 0.5, int: (min) => (ints.length ? ints.shift() : min) }

let ipCounter = 0
function client(origin = ORIGIN) {
    const jar = new Map()
    const ip = `203.0.113.${(ipCounter += 1) % 250}`
    async function call(method, path, body, { headers = {}, raw } = {}) {
        const sent = { origin, 'x-requested-with': '123bet', 'x-real-ip': ip, ...headers }
        if ((body !== undefined || raw !== undefined) && !sent['content-type']) sent['content-type'] = 'application/json'
        const cookie = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ')
        if (cookie) sent.cookie = cookie
        const response = await app.handle(new Request(`${ORIGIN}/api/app/${path}`, {
            method, headers: sent, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        }))
        for (const header of response.headers.getSetCookie()) {
            const [pair] = header.split(';')
            const name = pair.slice(0, pair.indexOf('='))
            const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
            if (/Max-Age=0\b/.test(header) || !value) jar.delete(name)
            else jar.set(name, value)
            assert.match(header, /HttpOnly/)
            assert.match(header, /Secure/)
            assert.match(header, /SameSite=Lax/)
        }
        const data = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : await response.text()
        return { status: response.status, data, response }
    }
    return {
        jar,
        call,
        get: (path, options) => call('GET', path, undefined, options),
        post: (path, body = {}, options) => call('POST', path, body, options),
        patch: (path, body) => call('PATCH', path, body),
    }
}

const PASSWORD = 'Senha-forte-2026'
let seq = 0
const key = (prefix = 'k') => `${prefix}-${Date.now().toString(36)}-${(seq += 1).toString().padStart(4, '0')}`

async function register(email, username) {
    const c = client()
    const signup = await c.post('auth/signup', { email, username, fullName: 'Pessoa Teste', password: PASSWORD, passwordConfirm: PASSWORD, acceptTerms: true, acceptPrivacy: true })
    assert.equal(signup.status, 200, JSON.stringify(signup.data))
    const confirm = await c.post('auth/confirm', { tokenHash: emulator.lastLink(email, 'signup') })
    assert.equal(confirm.status, 200, JSON.stringify(confirm.data))
    return { c, id: confirm.data.user.id }
}

before(async () => {
    db = await createTestDatabase()
    emulator = createEmulator({ db, serviceKey: SERVICE_KEY, anonKey: ANON_KEY, now })
    app = createAccountApp({
        env: {
            SUPABASE_URL: 'https://emulator.supabase.test', SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
            ACCOUNT_HASH_SECRET: 'hash-secret-for-tests-only-000000000000', PAYMENT_SANDBOX_WEBHOOK_SECRET: SANDBOX_SECRET, CRON_SECRET,
        },
        fetch: authFetch, rng, now, sleep: async (ms) => { offset += ms },
    })
})

after(() => db.close())

describe('server RNG', () => {
    test('the crypto RNG yields floats in [0, 1) and ints in range', async () => {
        const { cryptoRng } = await import('./games.js')
        for (let i = 0; i < 2000; i += 1) {
            const f = cryptoRng.float()
            assert.ok(f >= 0 && f < 1)
            const n = cryptoRng.int(3, 7)
            assert.ok(Number.isInteger(n) && n >= 3 && n < 7)
        }
    })
})

describe('disabled configuration', () => {
    test('without Supabase settings the API says so and never fakes a session', async () => {
        const off = createAccountApp({ env: {} })
        const me = await off.handle(new Request(`${ORIGIN}/api/app/me`))
        assert.deepEqual(await me.json(), { user: null, accountsEnabled: false })
        const login = await off.handle(new Request(`${ORIGIN}/api/app/auth/login`, { method: 'POST', headers: { origin: ORIGIN, 'x-requested-with': '123bet', 'content-type': 'application/json' }, body: '{}' }))
        assert.equal(login.status, 503)
    })
})

describe('sign-up, confirmation and login', () => {
    test('validation, terms and generic answers', async () => {
        const c = client()
        const base = { email: 'nova@example.com', username: 'nova', fullName: 'Nova Pessoa', password: PASSWORD, passwordConfirm: PASSWORD, acceptTerms: true, acceptPrivacy: true }
        assert.equal((await c.post('auth/signup', { ...base, password: 'curta1', passwordConfirm: 'curta1' })).data.error, 'weak_password')
        assert.equal((await c.post('auth/signup', { ...base, password: 'nova-senha-2026', passwordConfirm: 'nova-senha-2026' })).data.error, 'weak_password')
        assert.equal((await c.post('auth/signup', { ...base, passwordConfirm: 'Outra-senha-2026' })).data.error, 'password_mismatch')
        assert.equal((await c.post('auth/signup', { ...base, acceptTerms: false })).data.error, 'terms_required')
        assert.equal((await c.post('auth/signup', { ...base, username: 'a b' })).data.error, 'invalid_username')
        assert.equal((await c.post('auth/signup', { ...base, email: 'alguem@invalid.test', username: 'dominio_ruim' })).data.error, 'invalid_email')
        assert.equal((await c.post('auth/signup', base)).data.status, 'check_email')
        // Same e-mail again: same answer, no hint that the account exists.
        assert.equal((await c.post('auth/signup', { ...base, username: 'outro_nome' })).data.status, 'check_email')
        assert.equal((await c.post('auth/signup', { ...base, email: 'x@example.com' })).data.error, 'username_taken')
    })

    test('login before confirmation and with a wrong password share one error', async () => {
        const c = client()
        assert.equal((await c.post('auth/login', { email: 'nova@example.com', password: PASSWORD })).data.error, 'invalid_credentials')
        assert.equal((await c.post('auth/login', { email: 'ninguem@example.com', password: PASSWORD })).data.error, 'invalid_credentials')
        assert.equal(c.jar.size, 0)
    })

    test('confirming the e-mail signs in with httpOnly cookies and 1,000 coins', async () => {
        const c = client()
        const confirm = await c.post('auth/confirm', { tokenHash: emulator.lastLink('nova@example.com', 'signup') })
        assert.equal(confirm.status, 200)
        assert.equal(confirm.data.wallet.balance, 100000)
        assert.equal(confirm.data.profile.username, 'nova')
        assert.ok(c.jar.has('__Host-123bet-at') && c.jar.has('__Host-123bet-rt'))
        const me = await c.get('me')
        assert.equal(me.data.user.email, 'nova@example.com')
        assert.equal((await c.post('auth/confirm', { tokenHash: 'reused-or-invalid-token' })).data.error, 'invalid_link')
    })

    test('cross-site and header-less writes are refused', async () => {
        const { c } = await register('csrf@example.com', 'csrf_user')
        assert.equal((await c.post('wallet/free-credits', { amount: 100, idempotencyKey: key() }, { headers: { origin: 'https://evil.test' } })).status, 403)
        assert.equal((await c.post('wallet/free-credits', { amount: 100, idempotencyKey: key() }, { headers: { 'x-requested-with': '' } })).status, 403)
        assert.equal((await c.call('POST', 'wallet/free-credits', undefined, { raw: 'amount=100', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415)
    })

    test('repeated wrong passwords hit the shared rate limit', async () => {
        const c = client()
        const statuses = []
        for (let i = 0; i < 9; i += 1) statuses.push((await c.post('auth/login', { email: 'limite@example.com', password: `Errada-${i}-2026` })).status)
        assert.deepEqual(statuses.slice(0, 8), Array(8).fill(400))
        assert.equal(statuses[8], 429)
    })

    test('an expired access token is refreshed from the refresh cookie', async () => {
        const { c } = await register('refresh@example.com', 'refresh_user')
        const before = c.jar.get('__Host-123bet-at')
        offset += 2 * 3600 * 1000
        const me = await c.get('me')
        assert.equal(me.data.user.email, 'refresh@example.com')
        assert.notEqual(c.jar.get('__Host-123bet-at'), before)
    })

    test('a Supabase 429 or outage while refreshing keeps the session: 503, cookies stay, retry works', async () => {
        const { c } = await register('limite@example.com', 'limite')
        const start = offset
        offset += 2 * 3600 * 1000
        try {
            for (const status of [429, 503]) {
                tokenOutage = status
                const me = await c.get('me')
                assert.equal(me.status, 503)
                assert.equal(me.data.error, 'auth_unavailable')
                assert.ok(c.jar.has('__Host-123bet-rt') && c.jar.has('__Host-123bet-at'), `cookies kept on ${status}`)
            }
            tokenOutage = 0
            assert.equal((await c.get('me')).data.user.email, 'limite@example.com')
        } finally {
            tokenOutage = 0
            offset = start
        }
    })

    test('refreshes are limited per IP before they reach Supabase', async () => {
        const anon = client()
        const before = refreshCalls
        let limited = null
        for (let i = 0; i < 125 && !limited; i += 1) {
            anon.jar.set('__Host-123bet-rt', `inventado-${i}`)
            const me = await anon.get('me')
            if (me.status === 429) limited = { attempt: i + 1, body: me.data }
            else assert.equal(me.data.user, null)
        }
        assert.equal(limited?.attempt, 121)
        assert.equal(limited.body.error, 'rate_limited')
        assert.equal(refreshCalls - before, 120)
    })

    test('logout ends the session; logout-all ends every session', async () => {
        const { c } = await register('sair@example.com', 'sair_user')
        const other = client()
        await other.post('auth/login', { email: 'sair@example.com', password: PASSWORD })
        await c.post('auth/logout')
        assert.equal((await c.get('me')).data.user, null)
        assert.ok((await other.get('me')).data.user)
        await other.post('auth/logout-all')
        assert.equal((await other.get('me')).data.user, null)
    })

    test('e-mail change: password first, then links on both addresses', async () => {
        const { c } = await register('troca@example.com', 'troca_email')
        assert.equal((await c.post('account/email', { newEmail: 'troca@example.com', password: PASSWORD })).data.error, 'same_email')
        assert.equal((await c.post('account/email', { newEmail: 'novo-endereco@example.com', password: 'Errada-123456' })).data.error, 'invalid_credentials')
        assert.equal((await c.post('account/email', { newEmail: 'novo-endereco@example.com', password: PASSWORD })).data.status, 'check_email')
        const first = await client().post('auth/confirm', { tokenHash: emulator.lastLink('troca@example.com', 'email_change'), type: 'email_change' })
        assert.equal(first.data.status, 'email_change_pending')
        const second = await client().post('auth/confirm', { tokenHash: emulator.lastLink('novo-endereco@example.com', 'email_change'), type: 'email_change' })
        assert.equal(second.data.status, 'email_changed')
        assert.equal(second.data.user.email, 'novo-endereco@example.com')
        assert.equal((await client().post('auth/login', { email: 'novo-endereco@example.com', password: PASSWORD })).status, 200)
        assert.equal((await client().post('auth/login', { email: 'troca@example.com', password: PASSWORD })).data.error, 'invalid_credentials')
    })

    test('password recovery: generic answer, link resets the password and ends old sessions', async () => {
        const { c } = await register('esqueci@example.com', 'esqueci')
        const anon = client()
        assert.equal((await anon.post('auth/recover', { email: 'naoexiste@example.com' })).data.status, 'check_email')
        assert.equal((await anon.post('auth/recover', { email: 'esqueci@example.com' })).data.status, 'check_email')
        const NEW = 'Nova-senha-segura-9'
        const reset = await anon.post('auth/reset', { tokenHash: emulator.lastLink('esqueci@example.com', 'recovery'), password: NEW, passwordConfirm: NEW })
        assert.equal(reset.status, 200, JSON.stringify(reset.data))
        assert.equal((await c.get('me')).data.user, null)
        assert.equal((await client().post('auth/login', { email: 'esqueci@example.com', password: PASSWORD })).data.error, 'invalid_credentials')
        assert.equal((await client().post('auth/login', { email: 'esqueci@example.com', password: NEW })).status, 200)
    })

    test('link tokens in the URL fragment: only sessions opened from an e-mail link, never a signed-in session', async () => {
        await register('fragmento@example.com', 'fragmento')
        const signedIn = client()
        assert.equal((await signedIn.post('auth/login', { email: 'fragmento@example.com', password: PASSWORD })).status, 200)
        const ATTACK = 'Senha-trocada-sem-a-atual-1'
        // A stolen or shared session cookie must not set a new password without the current one.
        const stolen = { accessToken: signedIn.jar.get('__Host-123bet-at'), refreshToken: 'x', password: ATTACK, passwordConfirm: ATTACK }
        assert.equal((await client().post('auth/reset', stolen)).data.error, 'invalid_link')
        assert.equal((await client().post('auth/confirm', { accessToken: stolen.accessToken, refreshToken: 'x' })).data.error, 'invalid_link')
        assert.equal((await client().post('auth/login', { email: 'fragmento@example.com', password: PASSWORD })).status, 200)
        // Supabase's default recovery e-mail: the link is verified by Supabase and lands with fragment tokens.
        await client().post('auth/recover', { email: 'fragmento@example.com' })
        const verified = await (await emulator.fetch('https://emulator.supabase.test/auth/v1/verify', {
            method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'recovery', token_hash: emulator.lastLink('fragmento@example.com', 'recovery') }),
        })).json()
        const NEW = 'Nova-senha-pelo-link-7'
        const reset = await client().post('auth/reset', { accessToken: verified.access_token, refreshToken: verified.refresh_token, password: NEW, passwordConfirm: NEW })
        assert.equal(reset.status, 200, JSON.stringify(reset.data))
        // An hour later the same link session no longer counts as a fresh link.
        offset += 3700 * 1000
        try {
            await client().post('auth/recover', { email: 'fragmento@example.com' })
            const late = await (await emulator.fetch('https://emulator.supabase.test/auth/v1/verify', {
                method: 'POST', headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({ type: 'recovery', token_hash: emulator.lastLink('fragmento@example.com', 'recovery') }),
            })).json()
            offset += 3700 * 1000
            const claims = JSON.parse(Buffer.from(late.access_token.split('.')[1], 'base64url').toString('utf8'))
            assert.equal(claims.amr[0].method, 'otp')
            const tooLate = await client().post('auth/reset', { accessToken: late.access_token, refreshToken: late.refresh_token, password: ATTACK, passwordConfirm: ATTACK })
            assert.ok(tooLate.status === 400 || tooLate.status === 401, JSON.stringify(tooLate.data))
        } finally {
            offset = 0
        }
    })
})

describe('wallet and games', () => {
    let player
    before(async () => { player = await register('jogador@example.com', 'jogador') })

    test('anonymous visitors cannot touch wallets', async () => {
        assert.equal((await client().get('wallet')).status, 401)
        assert.equal((await client().post('games/dice', { stake: '1', target: 50, direction: 'over', idempotencyKey: key() })).status, 401)
    })

    test('dice is decided on the server and replays are idempotent', async () => {
        floats.push(0.9) // roll 90.00 > 50 -> win at 1.98x
        const idem = key('dice')
        const play = await player.c.post('games/dice', { stake: '10,00', target: 50, direction: 'over', idempotencyKey: idem })
        assert.equal(play.status, 200, JSON.stringify(play.data))
        assert.equal(play.data.round.result.win, true)
        assert.equal(play.data.wallet.balance, 100000 - 1000 + 1980)
        const replay = await player.c.post('games/dice', { stake: '10,00', target: 50, direction: 'over', idempotencyKey: idem })
        assert.equal(replay.data.replayed, true)
        assert.equal(replay.data.wallet.balance, play.data.wallet.balance)
        for (const stake of ['0,05', '10001', '1.234', '-5', 'abc']) {
            assert.equal((await player.c.post('games/dice', { stake, target: 50, direction: 'over', idempotencyKey: key() })).data.error, 'invalid_stake')
        }
        assert.equal((await player.c.post('games/dice', { stake: 1, target: 99, direction: 'over', idempotencyKey: key() })).data.error, 'invalid_target')
    })

    test('parallel bets never spend more than the balance', async () => {
        const poor = await register('pobre@example.com', 'pobre')
        floats.push(...Array(12).fill(0.0)) // all lose
        const results = await Promise.all(Array.from({ length: 12 }, () => poor.c.post('games/limbo', { stake: '300', target: 2, idempotencyKey: key('par') })))
        const ok = results.filter((r) => r.status === 200).length
        assert.equal(ok, 3)
        assert.ok(results.filter((r) => r.status !== 200).every((r) => r.data.error === 'insufficient_funds'))
        assert.equal((await poor.c.get('wallet')).data.wallet.balance, 10000)
    })

    test('plinko returns the path for the animation and pays the bin', async () => {
        ints.push(1, 1, 1, 1, 1, 1, 1, 1) // all right: last bin of 8 rows
        const play = await player.c.post('games/plinko', { stake: 1, rows: 8, risk: 'high', idempotencyKey: key('plk') })
        assert.equal(play.data.round.result.binIndex, 8)
        assert.equal(play.data.round.payout, 2900)
    })

    test('mines: secret positions, parallel reveals conflict, cash out pays once', async () => {
        // rng.int returns min: mines end up on tiles 0, 1, 2.
        const start = await player.c.post('games/mines/start', { stake: 1, mines: 3, idempotencyKey: key('mines') })
        assert.equal(start.status, 200, JSON.stringify(start.data))
        assert.equal(start.data.round.secret, undefined)
        assert.equal(JSON.stringify(start.data).includes('"mines":[0,1,2]'), false)
        const roundId = start.data.round.id
        const both = await Promise.all([5, 6].map((tile) => player.c.post('games/mines/reveal', { roundId, tile })))
        assert.deepEqual(both.map((r) => r.status).sort(), [200, 409])
        const cash = await player.c.post('games/mines/cashout', { roundId })
        const again = await player.c.post('games/mines/cashout', { roundId })
        assert.equal(cash.data.outcome, 'cashed')
        assert.deepEqual(cash.data.round.result.mines, [0, 1, 2])
        assert.equal(again.data.outcome, 'settled')
        const other = await register('outro@example.com', 'outro_jogador')
        assert.equal((await other.c.post('games/mines/reveal', { roundId, tile: 7 })).status, 404)
    })

    test('mines: hitting a mine loses; an abandoned round is closed as a cash out', async () => {
        const first = await player.c.post('games/mines/start', { stake: 1, mines: 3, idempotencyKey: key('mines') })
        const hit = await player.c.post('games/mines/reveal', { roundId: first.data.round.id, tile: 1 })
        assert.equal(hit.data.outcome, 'mine')
        assert.equal(hit.data.round.payout, 0)
        const abandoned = await player.c.post('games/mines/start', { stake: 1, mines: 3, idempotencyKey: key('mines') })
        await player.c.post('games/mines/reveal', { roundId: abandoned.data.round.id, tile: 9 })
        const next = await player.c.post('games/mines/start', { stake: 1, mines: 3, idempotencyKey: key('mines') })
        assert.equal(next.status, 200)
        const rounds = (await player.c.get('history/rounds?game=mines')).data.items
        const closed = rounds.find((r) => r.id === abandoned.data.round.id)
        assert.equal(closed.status, 'settled')
        assert.ok(closed.payout > 100)
    })

    test('crash: the server clock decides; claims above it are capped; watch reports the crash', async () => {
        offset = 0 // rounds are timed from the database clock
        floats.push(0.5) // crash point 2.00x
        const start = await player.c.post('games/crash/start', { stake: 1, idempotencyKey: key('crash') })
        const roundId = start.data.round.id
        offset += 5000 // e^(0.5) = 1.64x
        const cash = await player.c.post('games/crash/cashout', { roundId, multiplier: 1.9 })
        assert.equal(cash.data.state, 'cashed')
        assert.ok(cash.data.round.result.cashedOutAt <= 1.65 && cash.data.round.result.cashedOutAt >= 1.6)

        floats.push(0.5)
        const second = await player.c.post('games/crash/start', { stake: 1, idempotencyKey: key('crash') })
        const watch = await player.c.post('games/crash/watch', { roundId: second.data.round.id })
        assert.equal(watch.data.state, 'crashed')
        assert.equal(watch.data.round.result.crashPoint, 2)
        assert.equal((await player.c.post('games/crash/cashout', { roundId: second.data.round.id })).data.state, 'crashed')

        // A claim is paid at its exact two-decimal value: 1.15 * 100 is 114.999… in binary floating
        // point and used to be floored to a 1.14x payout.
        const offsetBefore = offset
        for (const claim of [1.15, 1.16, 2.3, 4.35]) {
            offset = 0
            floats.push(0.9) // 10x
            const exact = await player.c.post('games/crash/start', { stake: 1, idempotencyKey: key('crash') })
            offset = 20000 // e^2 = 7.39x on the server clock: above every claim, below the crash point
            const paid = await player.c.post('games/crash/cashout', { roundId: exact.data.round.id, multiplier: claim })
            assert.equal(paid.data.state, 'cashed')
            assert.equal(paid.data.round.result.cashedOutAt, claim)
            assert.equal(paid.data.round.payout, Math.round(claim * 100))
        }
        offset = offsetBefore

        floats.push(0.9) // 10x, auto cash out at 1.5x
        const auto = await player.c.post('games/crash/start', { stake: 1, autoCashout: '1,5', idempotencyKey: key('crash') })
        const autoWatch = await player.c.post('games/crash/watch', { roundId: auto.data.round.id })
        assert.equal(autoWatch.data.state, 'cashed')
        assert.equal(autoWatch.data.round.payout, 150)
    })

    test('crash/watch is limited per player (each call can hold a function for 10 s)', async () => {
        const { c } = await register('vigia@example.com', 'vigia')
        floats.push(0.0) // crash point 1.00x: the round is over at once and watch answers immediately
        const round = (await c.post('games/crash/start', { stake: 1, idempotencyKey: key('crash') })).data.round.id
        let limitedAt = null
        for (let i = 1; i <= 125 && !limitedAt; i += 1) {
            const watch = await c.post('games/crash/watch', { roundId: round })
            if (watch.status === 429) limitedAt = i
            else assert.equal(watch.data.state, 'crashed')
        }
        assert.equal(limitedAt, 121)
    })

    test('dino: each jump is rolled on the server', async () => {
        floats.push(0.1, 0.2) // rolls of jumps 1 and 2, drawn when the round opens (the rest: 0.5)
        const start = await player.c.post('games/dino/start', { stake: 1, difficulty: 'medium', idempotencyKey: key('dino') })
        const roundId = start.data.round.id
        assert.equal((await player.c.post('games/dino/jump', { roundId })).data.outcome, 'cleared')
        const second = await player.c.post('games/dino/jump', { roundId })
        assert.equal(second.data.multiplier, 2.34)
        const cash = await player.c.post('games/dino/cashout', { roundId })
        assert.equal(cash.data.round.payout, 234)
        floats.push(0.99)
        const lost = await player.c.post('games/dino/start', { stake: 1, difficulty: 'hard', idempotencyKey: key('dino') })
        assert.equal((await player.c.post('games/dino/jump', { roundId: lost.data.round.id })).data.outcome, 'crashed')
    })

    test('dino: parallel jumps for the same step get the same roll, so a crash cannot be dropped', async () => {
        // Step 1 crashes (0.99); a second, independent draw would have survived (0.1).
        floats.push(0.99, 0.1)
        const start = await player.c.post('games/dino/start', { stake: 1, difficulty: 'medium', idempotencyKey: key('dino') })
        const roundId = start.data.round.id
        settleDelayMs = 40 // the crash path is slower than a survival, as with the wallet lock on Postgres
        try {
            const jumps = await Promise.all([1, 2, 3].map(() => player.c.post('games/dino/jump', { roundId })))
            assert.ok(jumps.every((j) => j.data.outcome !== 'cleared'), JSON.stringify(jumps.map((j) => [j.status, j.data.outcome ?? j.data.error])))
        } finally {
            settleDelayMs = 0
        }
        const round = (await player.c.get('history/rounds?game=dino')).data.items.find((r) => r.id === roundId)
        assert.equal(round.status, 'settled')
        assert.equal(round.payout, 0)
    })

    test('a win above 1,000,000x pays the maximum instead of leaving the round stuck', async () => {
        // 24 cleared jumps on hard is far above the cap (the database refuses larger payouts).
        const { c: lucky } = await register('maximo@example.com', 'maximo')
        floats.push(...Array(24).fill(0))
        const start = await lucky.post('games/dino/start', { stake: 1, difficulty: 'hard', idempotencyKey: key('dino') })
        const roundId = start.data.round.id
        for (let i = 0; i < 24; i += 1) assert.equal((await lucky.post('games/dino/jump', { roundId })).data.outcome, 'cleared')
        const cash = await lucky.post('games/dino/cashout', { roundId })
        assert.equal(cash.status, 200, JSON.stringify(cash.data))
        assert.equal(cash.data.round.payout, 100 * 1_000_000)
        const next = await lucky.post('games/dino/start', { stake: 1, difficulty: 'easy', idempotencyKey: key('dino') })
        assert.equal(next.status, 200)
    })

    test('free credits, history filters, paging and stats', async () => {
        const claim = await player.c.post('wallet/free-credits', { amount: 500, idempotencyKey: key('free') })
        assert.equal(claim.status, 200)
        assert.equal((await player.c.post('wallet/free-credits', { amount: 123, idempotencyKey: key('free') })).data.error, 'invalid_amount')
        const page1 = await player.c.get('wallet/transactions?limit=3')
        assert.equal(page1.data.items.length, 3)
        const page2 = await player.c.get(`wallet/transactions?limit=3&cursor=${page1.data.nextCursor}`)
        assert.ok(page2.data.items.every((tx) => tx.seq < page1.data.items.at(-1).seq))
        const onlyFree = await player.c.get('wallet/transactions?types=free_credit')
        assert.ok(onlyFree.data.items.every((tx) => tx.type === 'free_credit'))
        assert.equal((await player.c.get('wallet/transactions?types=drop_table')).data.error, 'invalid_types')
        const wallet = await player.c.get('wallet')
        assert.ok(wallet.data.stats.games.some((g) => g.game === 'dice'))
    })
})

describe('promotions, payments sandbox and administration', () => {
    let admin
    let support
    let user
    before(async () => {
        admin = await register('admin@example.com', 'admin_123')
        support = await register('suporte@example.com', 'suporte_123')
        user = await register('cliente@example.com', 'cliente')
        await db.exec(`update public.profiles set role = 'admin' where id = '${admin.id}'; update public.profiles set role = 'support' where id = '${support.id}';`)
    })

    test('admin routes require a staff role; writes require admin', async () => {
        assert.equal((await user.c.get('admin/overview')).status, 403)
        assert.equal((await client().get('admin/overview')).status, 401)
        assert.equal((await support.c.get('admin/overview')).status, 200)
        assert.equal((await support.c.post('admin/coupons', { code: 'BEMVINDO', description: 'Cupom', amount: 20, maxRedemptions: 10, validUntil: '2099-01-01' })).status, 403)
        const coupon = await admin.c.post('admin/coupons', { code: 'bemvindo', description: 'Cupom de teste', amount: 20, maxRedemptions: 10, validUntil: '2099-01-01' })
        assert.equal(coupon.status, 200, JSON.stringify(coupon.data))
        const users = await support.c.get('admin/users?q=client')
        assert.equal(users.data.items[0].email, 'c******@example.com')
    })

    test('coupon redemption once, cashback status', async () => {
        const redeem = await user.c.post('promotions/coupon', { code: 'BEMVINDO' })
        assert.equal(redeem.data.wallet.promoBalance, 2000)
        assert.equal((await user.c.post('promotions/coupon', { code: 'BEMVINDO' })).data.error, 'coupon_already_redeemed')
        assert.equal((await user.c.post('promotions/coupon', { code: "X' OR 1=1" })).data.error, 'coupon_invalid')
        const promos = await user.c.get('promotions')
        assert.equal(promos.data.redemptions.length, 1)
        assert.equal(promos.data.cashback.rateBp, 100)
    })

    test('audited balance adjustment by an admin only', async () => {
        const before = (await user.c.get('wallet')).data.wallet.balance
        assert.equal((await support.c.post('admin/adjust', { userId: user.id, amount: '5', reason: 'Correção de teste', idempotencyKey: key('adj') })).status, 403)
        const adjust = await admin.c.post('admin/adjust', { userId: user.id, amount: '-5', reason: 'Correção de teste', idempotencyKey: key('adj') })
        assert.equal(adjust.status, 200, JSON.stringify(adjust.data))
        assert.equal((await user.c.get('wallet')).data.wallet.balance, before - 500)
        const audit = await admin.c.get('admin/audit')
        assert.ok(audit.data.items.some((entry) => entry.action === 'admin.wallet_adjusted'))
    })

    test('sandbox payments: states and events, never a balance change', async () => {
        const walletBefore = (await user.c.get('wallet')).data.wallet
        const created = await user.c.post('payments', { method: 'pix_simulado', amount: '50,00', idempotencyKey: key('pay') })
        assert.equal(created.status, 200, JSON.stringify(created.data))
        assert.match(created.data.instructions.reference, /^SANDBOX-/)
        const id = created.data.attempt.id
        assert.equal((await user.c.post('payments/simulate', { id, action: 'confirm' })).data.attempt.status, 'confirmed')
        assert.equal((await user.c.post('payments/simulate', { id, action: 'fail' })).data.outcome.outcome, 'ignored')
        assert.equal((await user.c.post('payments/simulate', { id, action: 'refund' })).data.attempt.status, 'refunded')
        assert.deepEqual((await user.c.get('wallet')).data.wallet, walletBefore)
        assert.equal((await support.c.post('payments/simulate', { id, action: 'confirm' })).status, 404)
    })

    test('webhook: bad or stale signatures are refused, replays are duplicates', async () => {
        const created = await user.c.post('payments', { method: 'cartao_simulado', amount: '10', idempotencyKey: key('pay') })
        const event = JSON.stringify({ id: 'evt_00000000-0000-4000-8000-000000000001', type: 'payment.confirmed', providerRef: created.data.attempt.providerRef })
        const hook = (signature) => client('https://psp.example').call('POST', 'payments/webhook/sandbox', undefined, { raw: event, headers: { 'x-sandbox-signature': signature, 'content-type': 'application/json' } })
        const t = Math.floor(now() / 1000)
        assert.equal((await hook(signSandboxEvent('wrong-secret-0000000000000000000000', event, t))).status, 401)
        assert.equal((await hook(signSandboxEvent(SANDBOX_SECRET, event, t - 3600))).status, 401)
        assert.equal((await hook(signSandboxEvent(SANDBOX_SECRET, event, t))).data.outcome, 'applied')
        assert.equal((await hook(signSandboxEvent(SANDBOX_SECRET, event, t))).data.outcome, 'duplicate')
        const events = await support.c.get('admin/payment-events')
        assert.ok(events.data.items.length >= 4)
    })

    test('withdrawals are unavailable to users; staff test the state machine', async () => {
        assert.deepEqual((await user.c.get('withdrawals')).data, { available: false, reason: 'financial_operations_disabled' })
        assert.equal((await user.c.post('admin/withdrawals', { amount: '10' })).status, 403)
        const created = await support.c.post('admin/withdrawals', { amount: '10', note: 'teste' })
        assert.equal(created.data.testOnly, true)
        assert.equal((await support.c.post('admin/withdrawals/transition', { id: created.data.id, to: 'in_review' })).data.status, 'in_review')
        assert.equal((await support.c.post('admin/withdrawals/transition', { id: created.data.id, to: 'approved' })).status, 403)
    })

    test('cron maintenance needs the cron secret', async () => {
        assert.equal((await client().get('cron/maintenance')).status, 401)
        const ok = await client().get('cron/maintenance', { headers: { authorization: `Bearer ${CRON_SECRET}` } })
        assert.equal(ok.status, 200)
    })
})

describe('privacy', () => {
    test('export and erase my data', async () => {
        const { c } = await register('apagar@example.com', 'apagar')
        const exported = await c.get('account/export')
        assert.match(exported.response.headers.get('content-disposition'), /attachment/)
        assert.equal(exported.data.profile.username, 'apagar')
        assert.equal((await c.post('account/delete', { password: PASSWORD, confirmation: 'excluir' })).data.error, 'confirmation_required')
        assert.equal((await c.post('account/delete', { password: 'Errada-123456', confirmation: 'EXCLUIR' })).data.error, 'invalid_credentials')
        const erased = await c.post('account/delete', { password: PASSWORD, confirmation: 'EXCLUIR' })
        assert.deepEqual(erased.data, { status: 'erased', authDeleted: true })
        assert.equal((await client().post('auth/login', { email: 'apagar@example.com', password: PASSWORD })).data.error, 'invalid_credentials')
        assert.equal((await db.query(`select count(*)::int as n from public.profiles where username = 'apagar'`)).rows[0].n, 0)
    })
})
