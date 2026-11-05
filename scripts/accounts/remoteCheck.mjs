// End-to-end check of a deployed preview against the real Supabase project: accounts, sessions,
// wallet, games, history, cross-user isolation (API and direct database access) and concurrency.
// Creates throwaway users through the Auth admin API (no e-mail is sent), then erases them through
// the app's own account deletion. Never prints keys, tokens or passwords.
//
//   BASE_URL=https://<preview> SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... \
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/accounts/remoteCheck.mjs
import { randomBytes } from 'node:crypto'

const BASE = process.env.BASE_URL?.replace(/\/$/, '')
const SB = process.env.SUPABASE_URL?.replace(/\/$/, '')
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!BASE || !SB || !ANON || !SERVICE) {
    console.error('Set BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(2)
}

const RUN = `qa${Date.now().toString(36)}`
const results = []
const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const key = (p) => `${p}-${RUN}-${randomBytes(6).toString('hex')}`

function client() {
    const jar = new Map()
    async function call(method, path, body) {
        const headers = { origin: BASE, 'x-requested-with': '123bet' }
        if (body !== undefined) headers['content-type'] = 'application/json'
        if (jar.size) headers.cookie = [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
        const response = await fetch(`${BASE}/api/app/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' })
        for (const header of response.headers.getSetCookie()) {
            const [pair] = header.split(';')
            const name = pair.slice(0, pair.indexOf('='))
            const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
            if (/Max-Age=0\b/.test(header) || !value) jar.delete(name)
            else jar.set(name, value)
        }
        let data = null
        try { data = await response.json() } catch { data = null }
        return { status: response.status, data }
    }
    return { jar, get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), accessToken: () => jar.get('__Host-123bet-at') }
}

async function admin(path, init = {}) {
    const response = await fetch(`${SB}${path}`, { ...init, headers: { apikey: SERVICE, 'content-type': 'application/json', ...(init.headers ?? {}) } })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { status: response.status, data }
}

// Confirmed test user: the admin API returns the confirmation token hash, and the app's own
// /auth/confirm route verifies it with Supabase Auth (the same step as clicking the e-mail link).
async function newUser(tag) {
    const email = `${RUN}-${tag}@example.com`
    const password = `Qa-${randomBytes(9).toString('base64url')}9`
    const username = `${RUN}_${tag}`.slice(0, 20)
    const link = await admin('/auth/v1/admin/generate_link', {
        method: 'POST',
        body: JSON.stringify({ type: 'signup', email, password, data: { username, full_name: `Teste ${tag}`, terms_version: '2026-11-04', privacy_version: '2026-11-04' } }),
    })
    if (link.status !== 200) throw new Error(`generate_link ${link.status}`)
    const c = client()
    const confirm = await c.post('auth/confirm', { tokenHash: link.data.hashed_token ?? link.data.properties?.hashed_token })
    return { c, email, password, username, id: confirm.data?.user?.id, confirm }
}

const users = []
try {
    // Accounts and sessions ----------------------------------------------------------------------
    const config = await client().get('auth/config')
    check('accounts enabled on the preview', config.data?.enabled === true)

    const a = await newUser('a')
    users.push(a)
    check('confirmation link signs in (httpOnly session cookies)', a.confirm.status === 200 && a.c.jar.has('__Host-123bet-at') && a.c.jar.has('__Host-123bet-rt'), `status ${a.confirm.status}`)
    check('new account starts with 1,000 coins', a.confirm.data?.wallet?.balance === 100000)
    check('profile created from sign-up data', a.confirm.data?.profile?.username === a.username)

    const login = client()
    const loginRes = await login.post('auth/login', { email: a.email, password: a.password })
    check('password login', loginRes.status === 200, `status ${loginRes.status}`)
    const wrong = await client().post('auth/login', { email: a.email, password: 'Senha-errada-123' })
    check('wrong password gives the generic error', wrong.data?.error === 'invalid_credentials')
    const ghost = await client().post('auth/login', { email: `${RUN}-ninguem@example.com`, password: 'Senha-errada-123' })
    check('unknown e-mail gives the same error', ghost.data?.error === 'invalid_credentials')
    await login.post('auth/logout')
    check('logout ends that session', (await login.get('me')).data?.user === null)
    check('other session still valid', (await a.c.get('me')).data?.user?.email === a.email)
    const csrf = await fetch(`${BASE}/api/app/wallet/free-credits`, { method: 'POST', headers: { origin: 'https://evil.example', 'x-requested-with': '123bet', 'content-type': 'application/json', cookie: `__Host-123bet-at=${a.c.accessToken()}` }, body: '{}' })
    check('cross-site write refused', csrf.status === 403)

    // Wallet, games, history ---------------------------------------------------------------------
    const free = await a.c.post('wallet/free-credits', { amount: '500', idempotencyKey: key('free') })
    check('free credits', free.status === 200 && free.data.wallet.balance === 150000, `status ${free.status}`)
    const dice = await a.c.post('games/dice', { stake: '10', target: 50, direction: 'over', idempotencyKey: key('dice') })
    check('dice round on the server', dice.status === 200 && typeof dice.data.round.result.roll === 'number', `status ${dice.status} ${dice.data?.error ?? ''}`)
    const limbo = await a.c.post('games/limbo', { stake: '5', target: 2, idempotencyKey: key('limbo') })
    check('limbo round', limbo.status === 200)
    const plinko = await a.c.post('games/plinko', { stake: '1', rows: 12, risk: 'medium', idempotencyKey: key('plinko') })
    check('plinko round with path', plinko.status === 200 && plinko.data.round.result.path.length === 12)
    const mines = await a.c.post('games/mines/start', { stake: '2', mines: 1, idempotencyKey: key('mines') })
    check('mines start hides the mine', mines.status === 200 && !JSON.stringify(mines.data).includes('"secret"') && mines.data.round.result && !mines.data.round.result.mines)
    let reveal = { data: {} }
    for (let tile = 0; tile < 25 && reveal.data.outcome !== 'gem' && reveal.data.outcome !== 'mine'; tile += 1) reveal = await a.c.post('games/mines/reveal', { roundId: mines.data.round.id, tile })
    if (reveal.data.outcome === 'gem') {
        const cash = await a.c.post('games/mines/cashout', { roundId: mines.data.round.id })
        check('mines reveal and cash out', cash.data.outcome === 'cashed' && cash.data.round.result.mines.length === 1)
    } else check('mines reveal (hit the single mine)', reveal.data.outcome === 'mine')
    const crash = await a.c.post('games/crash/start', { stake: '1', autoCashout: '1,10', idempotencyKey: key('crash') })
    const watch = await a.c.post('games/crash/watch', { roundId: crash.data.round.id })
    check('crash round ends through watch', ['cashed', 'crashed'].includes(watch.data.state), `state ${watch.data.state}`)
    const dino = await a.c.post('games/dino/start', { stake: '1', difficulty: 'easy', idempotencyKey: key('dino') })
    const jump = await a.c.post('games/dino/jump', { roundId: dino.data.round.id, step: dino.data.round.step })
    if (jump.data.outcome === 'cleared') {
        const again = await a.c.post('games/dino/jump', { roundId: dino.data.round.id, step: dino.data.round.step })
        check('dino retried jump does not roll again', again.data.stale === true)
        await a.c.post('games/dino/cashout', { roundId: dino.data.round.id })
    }
    check('dino jump rolled on the server', ['cleared', 'crashed'].includes(jump.data.outcome))
    const tx = await a.c.get('wallet/transactions?limit=50')
    check('ledger history lists the movements', tx.status === 200 && tx.data.items.length >= 8, `${tx.data.items?.length} items`)
    const rounds = await a.c.get('history/rounds?limit=50')
    check('round history', rounds.status === 200 && rounds.data.items.length >= 6)
    const wallet = await a.c.get('wallet')
    const lastTx = tx.data.items[0]
    check('wallet equals the last ledger balance', wallet.data.wallet.balance === lastTx.balanceAfter)
    check('stats per game', wallet.data.stats.games.length >= 5)

    // Isolation ----------------------------------------------------------------------------------
    const b = await newUser('b')
    users.push(b)
    const openA = await a.c.post('games/mines/start', { stake: '1', mines: 3, idempotencyKey: key('mines') })
    check("user B cannot play user A's round", (await b.c.post('games/mines/reveal', { roundId: openA.data.round.id, tile: 0 })).status === 404)
    check("user B cannot cash out user A's round", (await b.c.post('games/mines/cashout', { roundId: openA.data.round.id })).status === 404)
    const payA = await a.c.post('payments', { method: 'pix_simulado', amount: '10', idempotencyKey: key('pay') })
    check("user B cannot read user A's sandbox payment", (await b.c.get(`payments/detail?id=${payA.data.attempt.id}`)).status === 404)
    check("user B cannot drive user A's sandbox payment", (await b.c.post('payments/simulate', { id: payA.data.attempt.id, action: 'confirm' })).status === 404)
    check('user B is not staff', (await b.c.get('admin/overview')).status === 403)
    check('B balance untouched by A activity', (await b.c.get('wallet')).data.wallet.balance === 100000)

    // Direct database access with B's own token (as a curious user would try)
    const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, authorization: `Bearer ${b.c.accessToken()}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })
    const wallets = await (await rest('wallets?select=user_id,balance')).json()
    check('RLS: B reads only its own wallet', Array.isArray(wallets) && wallets.length === 1 && wallets[0].user_id === b.id, `${wallets.length} rows`)
    const others = await (await rest(`wallet_transactions?select=id&user_id=eq.${a.id}`)).json()
    check("RLS: B sees none of A's ledger", Array.isArray(others) && others.length === 0)
    const secret = await rest('game_rounds?select=secret')
    check('round secrets are not readable', secret.status >= 400)
    const write = await rest(`wallets?user_id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify({ balance: 999999999 }), headers: { prefer: 'return=representation' } })
    check('B cannot write its balance directly', write.status >= 400)
    const rpc = await rest('rpc/claim_free_credits', { method: 'POST', body: JSON.stringify({ p_user: b.id, p_amount: 500000, p_idem: key('x') }) })
    check('B cannot call server functions directly', rpc.status >= 400)
    const anonRead = await fetch(`${SB}/rest/v1/profiles?select=id`, { headers: { apikey: ANON } })
    const anonRows = anonRead.ok ? await anonRead.json() : []
    check('anonymous key reads no profiles', !anonRead.ok || anonRows.length === 0)

    // Concurrency on the real database -------------------------------------------------------------
    const c = await newUser('c')
    users.push(c)
    const burst = await Promise.all(Array.from({ length: 20 }, () => c.c.post('games/limbo', { stake: '300', target: 1000000, idempotencyKey: key('burst') })))
    const accepted = burst.filter((r) => r.status === 200).length
    const refused = burst.filter((r) => r.data?.error === 'insufficient_funds').length
    const after = (await c.c.get('wallet')).data.wallet
    const won = burst.filter((r) => r.status === 200 && r.data.round.payout > 0).length
    check('20 parallel bets of 300 with 1,000: exactly 3 accepted', accepted === 3 && refused === 17 && (won > 0 || after.balance === 10000), `accepted ${accepted}, refused ${refused}, balance ${after.balance}`)

    const sameKey = key('same')
    const dup = await Promise.all(Array.from({ length: 8 }, () => c.c.post('games/dice', { stake: '1', target: 50, direction: 'under', idempotencyKey: sameKey })))
    const ids = new Set(dup.filter((r) => r.status === 200).map((r) => r.data.round.id))
    check('same idempotency key in parallel: one round', ids.size === 1 && dup.every((r) => r.status === 200), `${ids.size} round(s), statuses ${[...new Set(dup.map((r) => r.status))]}`)

    await c.c.post('wallet/free-credits', { amount: '100', idempotencyKey: key('free') })
    const round = await c.c.post('games/mines/start', { stake: '1', mines: 1, idempotencyKey: key('mines') })
    // Parallel reveals of different tiles may legitimately succeed one after another; what must hold
    // is that no accepted reveal is lost and requests racing on the same step are refused.
    const reveals = await Promise.all(Array.from({ length: 10 }, (_, tile) => c.c.post('games/mines/reveal', { roundId: round.data.round.id, tile: tile + 10 })))
    const gems = reveals.filter((r) => r.data?.outcome === 'gem').map((r, i) => r.data.round.state.revealed.at(-1) ?? i)
    const conflicts = reveals.filter((r) => r.data?.error === 'round_conflict').length
    const finalRound = (await c.c.get('history/rounds?game=mines&limit=5')).data.items.find((r) => r.id === round.data.round.id)
    const finalTiles = finalRound.status === 'open' ? finalRound.state.revealed : (finalRound.result.revealed ?? [])
    const applied = reveals.filter((r) => r.status === 200 && ['gem', 'mine', 'cleared'].includes(r.data.outcome)).length
    check('10 parallel reveals: no lost or duplicate update', gems.every((tile) => finalTiles.includes(tile)) && new Set(finalTiles).size === finalTiles.length
        && applied + conflicts + reveals.filter((r) => r.data?.outcome === 'settled').length === 10 && finalRound.step === gems.length,
    `${gems.length} gems, ${conflicts} conflicts, step ${finalRound.step}, tiles ${finalTiles.length}`)
    const current = await c.c.get('games/mines/current')
    if (current.data.round) {
        const before = (await c.c.get('wallet')).data.wallet.balance
        const cashes = await Promise.all(Array.from({ length: 6 }, () => c.c.post('games/mines/cashout', { roundId: round.data.round.id })))
        const paid = (await c.c.get('wallet')).data.wallet.balance - before
        const payout = cashes.find((r) => r.data?.round?.payout > 0)?.data.round.payout
        const wins = (await c.c.get('wallet/transactions?types=win&origins=mines&limit=100')).data.items.filter((t) => t.referenceId === round.data.round.id)
        check('6 parallel cash outs pay once', wins.length === 1 && paid === payout && cashes.every((r) => r.status === 200), `ledger wins ${wins.length}, paid ${paid}, payout ${payout}`)
    } else {
        check('round ended by a mine during the reveals (no cash out to test)', true)
    }

    // Staff checks with a temporary admin
    const ad = await newUser('adm')
    users.push(ad)
    const promote = await admin(`/rest/v1/profiles?id=eq.${ad.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }), headers: { prefer: 'return=minimal' } })
    check('temporary admin role (service key)', promote.status === 204, `status ${promote.status}`)
    const code = `QA${RUN.slice(-8).toUpperCase()}`
    const coupon = await ad.c.post('admin/coupons', { code, description: 'Cupom de teste automatizado', amount: '5', maxRedemptions: 1, validUntil: new Date(Date.now() + 86400000).toISOString() })
    check('admin creates coupon', coupon.status === 200, `status ${coupon.status} ${coupon.data?.error ?? ''}`)
    const redeems = await Promise.all([a, b, c].map((u) => u.c.post('promotions/coupon', { code })))
    check('3 users redeem a single-use coupon at once: one wins', redeems.filter((r) => r.status === 200).length === 1 && redeems.filter((r) => r.data?.error === 'coupon_exhausted').length === 2)
    const overview = await ad.c.get('admin/overview')
    check('ledger and wallets agree (admin metric)', overview.data?.metrics?.ledgerCheck === 0, `divergent ${overview.data?.metrics?.ledgerCheck}`)
    check('admin cannot adjust own balance', (await ad.c.post('admin/adjust', { userId: ad.id, amount: '10', reason: 'Teste automatizado' , idempotencyKey: key('adj') })).data?.error === 'self_adjustment_forbidden')
    await admin(`/rest/v1/coupons?code=eq.${code}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } })
} catch (error) {
    check('unexpected error', false, error.message)
} finally {
    // Clean up through the app's own erasure (LGPD path), which also deletes the Auth user.
    for (const u of users) {
        const erased = await u.c.post('account/delete', { password: u.password, confirmation: 'EXCLUIR' })
        check(`erase test user ${u.username}`, erased.status === 200 && erased.data.authDeleted === true, `status ${erased.status}`)
    }
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    process.exitCode = failed.length ? 1 : 0
}
