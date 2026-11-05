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
        fetch: emulator.fetch, rng, now, sleep: async (ms) => { offset += ms },
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

        floats.push(0.9) // 10x, auto cash out at 1.5x
        const auto = await player.c.post('games/crash/start', { stake: 1, autoCashout: '1,5', idempotencyKey: key('crash') })
        const autoWatch = await player.c.post('games/crash/watch', { roundId: auto.data.round.id })
        assert.equal(autoWatch.data.state, 'cashed')
        assert.equal(autoWatch.data.round.payout, 150)
    })

    test('dino: each jump is rolled on the server', async () => {
        const start = await player.c.post('games/dino/start', { stake: 1, difficulty: 'medium', idempotencyKey: key('dino') })
        const roundId = start.data.round.id
        floats.push(0.1, 0.2)
        assert.equal((await player.c.post('games/dino/jump', { roundId })).data.outcome, 'cleared')
        const second = await player.c.post('games/dino/jump', { roundId })
        assert.equal(second.data.multiplier, 2.34)
        const cash = await player.c.post('games/dino/cashout', { roundId })
        assert.equal(cash.data.round.payout, 234)
        const lost = await player.c.post('games/dino/start', { stake: 1, difficulty: 'hard', idempotencyKey: key('dino') })
        floats.push(0.99)
        assert.equal((await player.c.post('games/dino/jump', { roundId: lost.data.round.id })).data.outcome, 'crashed')
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
