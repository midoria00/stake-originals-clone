// Database rules, run against the real migrations in PGlite.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { asUser, callRpc, createAuthUser, createTestDatabase } from './testing/pg.js'

let db
let alice
let bob
let admin
let support

const rpc = (name, args, role) => callRpc(db, name, args, role)
const rejects = (promise, code) => assert.rejects(promise, (error) => {
    assert.match(error.message, new RegExp(code))
    return true
})
const wallet = async (user) => (await rpc('account_summary', { p_user: user })).wallet
const ledgerMatches = async () => (await rpc('admin_metrics', { p_actor: admin })).ledgerCheck === 0

before(async () => {
    db = await createTestDatabase()
    alice = await createAuthUser(db, { email: 'alice@example.com', username: 'Alice' })
    bob = await createAuthUser(db, { email: 'bob@example.com', username: 'bob' })
    admin = await createAuthUser(db, { email: 'admin@example.com', username: 'chefe' })
    support = await createAuthUser(db, { email: 'support@example.com', username: 'suporte' })
    await db.exec(`update public.profiles set role = 'admin' where id = '${admin}'; update public.profiles set role = 'support' where id = '${support}';`)
})

after(() => db.close())

describe('accounts', () => {
    test('a new auth user gets a profile, settings and 1,000 welcome coins', async () => {
        const summary = await rpc('account_summary', { p_user: alice })
        assert.equal(summary.profile.username, 'alice')
        assert.equal(summary.wallet.balance, 100000)
        assert.equal(summary.settings.hideBalance, false)
        const list = await rpc('list_transactions', { p_user: alice })
        assert.deepEqual(list.items.map((tx) => tx.type), ['welcome'])
    })

    test('a username taken during sign-up gets a suffix instead of failing the sign-up', async () => {
        const twin = await createAuthUser(db, { email: 'other-bob@example.com', username: 'bob' })
        const summary = await rpc('account_summary', { p_user: twin })
        assert.match(summary.profile.username, /^bob_[0-9a-f]{4}$/)
    })

    test('profile and settings updates are validated', async () => {
        await rejects(rpc('update_profile', { p_user: alice, p_full_name: 'A' }), 'invalid_full_name')
        const summary = await rpc('update_settings', { p_user: alice, p_settings: { hideBalance: true, sessionReminderMinutes: 30, role: 'admin' } })
        assert.equal(summary.settings.hideBalance, true)
        assert.equal(summary.settings.sessionReminderMinutes, 30)
        assert.equal(summary.profile.role, 'user')
        await rejects(rpc('update_settings', { p_user: alice, p_settings: { sessionReminderMinutes: 7 } }), 'invalid_settings')
    })
})

describe('wallet ledger', () => {
    test('an instant round debits the stake and credits the payout atomically', async () => {
        const before = await wallet(alice)
        const result = await rpc('play_instant_round', { p_user: alice, p_game: 'dice', p_stake: 1000, p_payout: 1980, p_multiplier_bp: 19800, p_params: { target: 50 }, p_result: { roll: 70 }, p_idem: 'dice-round-0001' })
        assert.equal(result.replayed, false)
        assert.equal(result.wallet.balance, before.balance + 980)
        assert.ok(await ledgerMatches())
    })

    test('replaying an idempotency key returns the stored round and moves nothing', async () => {
        const before = await wallet(alice)
        const result = await rpc('play_instant_round', { p_user: alice, p_game: 'dice', p_stake: 1000, p_payout: 0, p_multiplier_bp: 0, p_params: {}, p_result: {}, p_idem: 'dice-round-0001' })
        assert.equal(result.replayed, true)
        assert.equal(result.round.payout, 1980)
        assert.equal((await wallet(alice)).balance, before.balance)
    })

    test('stakes above the balance or outside the limits are refused', async () => {
        await rejects(rpc('play_instant_round', { p_user: bob, p_game: 'limbo', p_stake: 1000000, p_payout: 0, p_multiplier_bp: 0, p_params: {}, p_result: {}, p_idem: 'limbo-too-much' }), 'insufficient_funds')
        await rejects(rpc('play_instant_round', { p_user: bob, p_game: 'limbo', p_stake: 5, p_payout: 0, p_multiplier_bp: 0, p_params: {}, p_result: {}, p_idem: 'limbo-too-small' }), 'invalid_amount')
        await rejects(rpc('play_instant_round', { p_user: bob, p_game: 'mines', p_stake: 100, p_payout: 0, p_multiplier_bp: 0, p_params: {}, p_result: {}, p_idem: 'wrong-game-01' }), 'invalid_game')
        assert.equal((await wallet(bob)).balance, 100000)
    })

    test('ledger rows cannot be edited or deleted', async () => {
        await rejects(db.exec(`update public.wallet_transactions set amount = 999999 where user_id = '${alice}'`), 'append_only')
        await rejects(db.exec(`delete from public.wallet_transactions where user_id = '${alice}'`), 'append_only')
    })

    test('free credits: fixed amounts, a ceiling and idempotency', async () => {
        await rejects(rpc('claim_free_credits', { p_user: bob, p_amount: 12345, p_idem: 'free-bad-amount' }), 'invalid_amount')
        const first = await rpc('claim_free_credits', { p_user: bob, p_amount: 50000, p_idem: 'free-claim-0001' })
        const again = await rpc('claim_free_credits', { p_user: bob, p_amount: 50000, p_idem: 'free-claim-0001' })
        assert.equal(first.wallet.balance, 150000)
        assert.equal(again.replayed, true)
        assert.equal(again.wallet.balance, 150000)
        await db.exec(`select set_config('app.erasure', 'off', false)`)
        for (let i = 0; i < 19; i += 1) await rpc('claim_free_credits', { p_user: bob, p_amount: 500000, p_idem: `free-fill-${String(i).padStart(4, '0')}` })
        await rejects(rpc('claim_free_credits', { p_user: bob, p_amount: 500000, p_idem: 'free-over-ceiling' }), 'ceiling_reached')
    })
})

describe('interactive rounds', () => {
    let round
    test('only one open round per game, stake taken on open', async () => {
        const before = await wallet(alice)
        const opened = await rpc('open_round', { p_user: alice, p_game: 'mines', p_stake: 500, p_params: { mines: 3 }, p_state: { revealed: [] }, p_secret: { mines: [1, 2, 3] }, p_idem: 'mines-open-0001' })
        round = opened.round
        assert.equal(opened.wallet.balance, before.balance - 500)
        assert.deepEqual(opened.secret, { mines: [1, 2, 3] })
        await rejects(rpc('open_round', { p_user: alice, p_game: 'mines', p_stake: 500, p_params: {}, p_state: {}, p_secret: {}, p_idem: 'mines-open-0002' }), 'round_already_open')
    })

    test('a stale step is a conflict (parallel reveal)', async () => {
        await rpc('round_step', { p_user: alice, p_round: round.id, p_expected_step: 0, p_state: { revealed: [7] } })
        await rejects(rpc('round_step', { p_user: alice, p_round: round.id, p_expected_step: 0, p_state: { revealed: [8] } }), 'round_conflict')
        await rejects(rpc('round_step', { p_user: bob, p_round: round.id, p_expected_step: 1, p_state: {} }), 'round_conflict')
    })

    test('settling twice pays once', async () => {
        const before = await wallet(alice)
        const first = await rpc('settle_round', { p_user: alice, p_round: round.id, p_payout: 560, p_multiplier_bp: 11200, p_result: { mines: [1, 2, 3] }, p_expected_step: 1 })
        const second = await rpc('settle_round', { p_user: alice, p_round: round.id, p_payout: 99999, p_multiplier_bp: 0, p_result: {}, p_expected_step: 1 })
        assert.equal(first.wallet.balance, before.balance + 560)
        assert.equal(second.replayed, true)
        assert.equal(second.round.payout, 560)
        assert.equal((await wallet(alice)).balance, before.balance + 560)
        await rejects(rpc('settle_round', { p_user: bob, p_round: round.id, p_payout: 1, p_multiplier_bp: 0, p_result: {} }), 'round_not_found')
        await rejects(db.exec(`update public.game_rounds set payout = 1 where id = '${round.id}'`), 'round_settled')
        assert.ok(await ledgerMatches())
    })
})

describe('sports bets', () => {
    const selections = [
        { matchId: '1001', matchLabel: 'Time A x Time B', market: '1x2', selection: 'home', selectionLabel: 'Time A', oddsBp: 20000 },
        { matchId: '1002', matchLabel: 'Time C x Time D', market: '1x2', selection: 'draw', selectionLabel: 'Empate', oddsBp: 30000 },
    ]
    test('place, then settle once', async () => {
        const before = await wallet(alice)
        const placed = await rpc('place_sports_bet', { p_user: alice, p_kind: 'multiple', p_stake: 1000, p_odds_bp: 60000, p_potential: 6000, p_source: 'demo', p_selections: selections, p_idem: 'sports-bet-0001' })
        assert.equal(placed.wallet.balance, before.balance - 1000)
        const ids = placed.bet.selections.map((s) => ({ id: s.id, status: 'won', result: { score: '2-1' } }))
        const settled = await rpc('settle_sports_bet', { p_bet: placed.bet.id, p_status: 'won', p_payout: 6000, p_selections: ids })
        const again = await rpc('settle_sports_bet', { p_bet: placed.bet.id, p_status: 'won', p_payout: 6000, p_selections: ids })
        assert.equal(settled.bet.status, 'won')
        assert.equal(again.replayed, true)
        assert.equal((await wallet(alice)).balance, before.balance + 5000)
    })

    test('invalid bets and settlements are refused', async () => {
        await rejects(rpc('place_sports_bet', { p_user: alice, p_kind: 'single', p_stake: 1000, p_odds_bp: 60000, p_potential: 6000, p_source: 'demo', p_selections: selections, p_idem: 'sports-bet-0002' }), 'invalid_selections')
        await rejects(rpc('place_sports_bet', { p_user: alice, p_kind: 'multiple', p_stake: 1000, p_odds_bp: 60000, p_potential: 6000, p_source: 'demo', p_selections: [selections[0], selections[0]], p_idem: 'sports-bet-0003' }), 'invalid_selections')
        const placed = await rpc('place_sports_bet', { p_user: alice, p_kind: 'single', p_stake: 1000, p_odds_bp: 20000, p_potential: 2000, p_source: 'demo', p_selections: [selections[0]], p_idem: 'sports-bet-0004' })
        await rejects(rpc('settle_sports_bet', { p_bet: placed.bet.id, p_status: 'won', p_payout: 999999, p_selections: [] }), 'invalid_settlement')
        await rejects(rpc('settle_sports_bet', { p_bet: placed.bet.id, p_status: 'lost', p_payout: 10, p_selections: [] }), 'invalid_settlement')
    })
})

describe('promotions', () => {
    test('coupons: admin creates, user redeems once, promo credits are spent first and expire', async () => {
        await rejects(rpc('admin_coupon_upsert', { p_actor: support, p_data: { code: 'BOASVINDAS', description: 'Boas-vindas', amount: 2000, maxRedemptions: 2, validUntil: '2099-01-01T00:00:00Z' } }), 'forbidden')
        await rpc('admin_coupon_upsert', { p_actor: admin, p_data: { code: 'boasvindas', description: 'Boas-vindas', amount: 2000, maxRedemptions: 2, validUntil: '2099-01-01T00:00:00Z' } })
        await rpc('admin_coupon_upsert', { p_actor: admin, p_data: { code: 'VENCIDO', description: 'Vencido', amount: 2000, maxRedemptions: 9, validFrom: '2020-01-01T00:00:00Z', validUntil: '2021-01-01T00:00:00Z' } })
        await rejects(rpc('admin_coupon_upsert', { p_actor: admin, p_data: { code: 'x', description: 'curto', amount: 1, maxRedemptions: 1, validUntil: '2099-01-01T00:00:00Z' } }), 'invalid_coupon')

        const redeemed = await rpc('coupon_redeem', { p_user: alice, p_code: ' BoasVindas ' })
        assert.equal(redeemed.wallet.promoBalance, 2000)
        await rejects(rpc('coupon_redeem', { p_user: alice, p_code: 'BOASVINDAS' }), 'coupon_already_redeemed')
        await rejects(rpc('coupon_redeem', { p_user: alice, p_code: 'VENCIDO' }), 'coupon_invalid')
        await rejects(rpc('coupon_redeem', { p_user: alice, p_code: 'NAOEXISTE' }), 'coupon_invalid')
        await rpc('coupon_redeem', { p_user: bob, p_code: 'BOASVINDAS' })
        const third = await createAuthUser(db, { email: 'carol@example.com', username: 'carol' })
        await rejects(rpc('coupon_redeem', { p_user: third, p_code: 'BOASVINDAS' }), 'coupon_exhausted')

        const before = await wallet(alice)
        await rpc('play_instant_round', { p_user: alice, p_game: 'limbo', p_stake: 1500, p_payout: 0, p_multiplier_bp: 0, p_params: {}, p_result: {}, p_idem: 'limbo-promo-0001' })
        const afterSpend = await wallet(alice)
        assert.equal(afterSpend.promoBalance, 500)
        assert.equal(afterSpend.balance, before.balance)

        await db.exec(`update public.bonuses set expires_at = now() - interval '1 second' where user_id = '${alice}' and status = 'active'`)
        const expired = await wallet(alice)
        assert.equal(expired.promoBalance, 0)
        const types = (await rpc('list_transactions', { p_user: alice, p_types: ['bonus_expired'] })).items
        assert.equal(types[0].promo_amount, -500)
        assert.ok(await ledgerMatches())
    })

    test('cashback is 1% of last week volume, capped, claimable once', async () => {
        const dave = await createAuthUser(db, { email: 'dave@example.com', username: 'dave' })
        // Backdated bets (last week), written directly as the ledger would.
        await db.exec(`
            insert into public.wallet_transactions (user_id, type, amount, balance_after, promo_balance_after, origin, created_at)
            values ('${dave}', 'bet', -80000, 20000, 0, 'dice', date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - interval '3 days');
            update public.wallets set balance = 20000 where user_id = '${dave}';`)
        const status = await rpc('cashback_status', { p_user: dave })
        assert.equal(status.wagered, 80000)
        assert.equal(status.amount, 800)
        const claimed = await rpc('cashback_claim', { p_user: dave })
        assert.equal(claimed.claimed, true)
        assert.equal(claimed.wallet.promoBalance, 800)
        await rejects(rpc('cashback_claim', { p_user: dave }), 'cashback_already_claimed')
        await rejects(rpc('cashback_claim', { p_user: bob }), 'cashback_unavailable')
    })
})

describe('payment sandbox', () => {
    let attempt
    test('events apply valid transitions once and never touch the wallet', async () => {
        const before = await wallet(bob)
        attempt = (await rpc('payment_create', { p_user: bob, p_method: 'pix_simulado', p_amount_cents: 5000, p_provider_ref: 'sbx_ref_0001', p_ttl_seconds: 900, p_idem: 'pay-create-0001' })).attempt
        assert.equal(attempt.status, 'pending')
        const confirmed = await rpc('payment_record_event', { p_provider: 'sandbox', p_event_id: 'evt_0000001', p_provider_ref: 'sbx_ref_0001', p_type: 'payment.confirmed', p_payload: {} })
        assert.equal(confirmed.outcome, 'applied')
        assert.equal((await rpc('payment_record_event', { p_provider: 'sandbox', p_event_id: 'evt_0000001', p_provider_ref: 'sbx_ref_0001', p_type: 'payment.confirmed', p_payload: {} })).outcome, 'duplicate')
        assert.equal((await rpc('payment_record_event', { p_provider: 'sandbox', p_event_id: 'evt_0000002', p_provider_ref: 'sbx_ref_0001', p_type: 'payment.failed', p_payload: {} })).outcome, 'ignored')
        assert.equal((await rpc('payment_record_event', { p_provider: 'sandbox', p_event_id: 'evt_0000003', p_provider_ref: 'sbx_ref_0001', p_type: 'payment.refunded', p_payload: {} })).outcome, 'applied')
        assert.equal((await rpc('payment_record_event', { p_provider: 'sandbox', p_event_id: 'evt_0000004', p_provider_ref: 'nope_ref', p_type: 'payment.confirmed', p_payload: {} })).outcome, 'rejected')
        assert.deepEqual(await wallet(bob), before)
    })

    test('overdue attempts expire through reconciliation and late confirmations are ignored', async () => {
        await rpc('payment_create', { p_user: bob, p_method: 'cartao_simulado', p_amount_cents: 2000, p_provider_ref: 'sbx_ref_0002', p_ttl_seconds: 60, p_idem: 'pay-create-0002' })
        await db.exec(`update public.payment_attempts set expires_at = now() - interval '1 second' where provider_ref = 'sbx_ref_0002'`)
        assert.equal((await rpc('payment_record_event', { p_provider: 'sandbox', p_event_id: 'evt_0000010', p_provider_ref: 'sbx_ref_0002', p_type: 'payment.confirmed', p_payload: {} })).detail, 'attempt_expired')
        const report = await rpc('payment_reconcile')
        assert.equal(report.expired, 1)
        assert.deepEqual(report.mismatches, [])
        await rejects(rpc('payment_create', { p_user: bob, p_method: 'pix_simulado', p_amount_cents: 99, p_provider_ref: 'sbx_ref_0003', p_ttl_seconds: 900, p_idem: 'pay-create-0003' }), 'invalid_payment')
    })
})

describe('test-only withdrawals', () => {
    test('state machine, roles and audit', async () => {
        await rejects(rpc('withdrawal_create', { p_actor: alice, p_amount_cents: 1000, p_note: null }), 'forbidden')
        const created = await rpc('withdrawal_create', { p_actor: support, p_amount_cents: 1000, p_note: 'teste interno' })
        await rpc('withdrawal_transition', { p_actor: support, p_id: created.id, p_to: 'in_review', p_note: null })
        await rejects(rpc('withdrawal_transition', { p_actor: support, p_id: created.id, p_to: 'approved', p_note: null }), 'forbidden')
        await rpc('withdrawal_transition', { p_actor: admin, p_id: created.id, p_to: 'approved', p_note: null })
        await rejects(rpc('withdrawal_transition', { p_actor: admin, p_id: created.id, p_to: 'requested', p_note: null }), 'invalid_transition')
        const done = await rpc('withdrawal_transition', { p_actor: admin, p_id: created.id, p_to: 'completed', p_note: null })
        assert.equal(done.status, 'completed')
        assert.equal(done.test_only, true)
        const audit = await rpc('admin_audit', { p_actor: admin, p_limit: 200 })
        assert.equal(audit.filter((entry) => entry.action === 'withdrawal.test_transition').length, 3)
    })
})

describe('administration', () => {
    test('roles are enforced and adjustments are audited', async () => {
        await rejects(rpc('admin_users', { p_actor: alice }), 'forbidden')
        const users = await rpc('admin_users', { p_actor: support, p_query: 'ali' })
        assert.equal(users.length, 1)
        assert.equal(users[0].email, 'a****@example.com')
        assert.equal((await rpc('admin_user_detail', { p_actor: support, p_user: alice })).email, 'a****@example.com')
        assert.equal((await rpc('admin_user_detail', { p_actor: admin, p_user: alice })).email, 'alice@example.com')

        await rejects(rpc('admin_adjust_wallet', { p_actor: support, p_user: alice, p_amount: 100, p_reason: 'correção de teste', p_idem: 'adjust-0001' }), 'forbidden')
        await rejects(rpc('admin_adjust_wallet', { p_actor: admin, p_user: admin, p_amount: 100, p_reason: 'correção de teste', p_idem: 'adjust-0002' }), 'self_adjustment_forbidden')
        await rejects(rpc('admin_adjust_wallet', { p_actor: admin, p_user: alice, p_amount: 100, p_reason: 'curto', p_idem: 'adjust-0003' }), 'invalid_reason')
        const before = await wallet(alice)
        await rpc('admin_adjust_wallet', { p_actor: admin, p_user: alice, p_amount: 100, p_reason: 'correção de teste', p_idem: 'adjust-0004' })
        await rpc('admin_adjust_wallet', { p_actor: admin, p_user: alice, p_amount: 100, p_reason: 'correção de teste', p_idem: 'adjust-0004' })
        assert.equal((await wallet(alice)).balance, before.balance + 100)
        const audit = await rpc('admin_audit', { p_actor: admin, p_limit: 200 })
        assert.equal(audit.filter((entry) => entry.action === 'admin.wallet_adjusted').length, 1)
        assert.ok(await ledgerMatches())
    })
})

describe('row level security', () => {
    test('a signed-in user reads only their own rows and never writes', async () => {
        assert.equal((await asUser(db, alice, 'select count(*)::int as n from public.wallets')).rows[0].n, 1)
        assert.equal((await asUser(db, alice, `select count(*)::int as n from public.wallet_transactions where user_id = '${bob}'`)).rows[0].n, 0)
        assert.equal((await asUser(db, alice, 'select count(*)::int as n from public.profiles')).rows[0].n, 1)
        await rejects(asUser(db, alice, 'select secret from public.game_rounds'), 'permission denied')
        await rejects(asUser(db, alice, 'select * from public.coupons'), 'permission denied')
        await rejects(asUser(db, alice, `update public.wallets set balance = 99999999 where user_id = '${alice}'`), 'permission denied')
        await rejects(asUser(db, alice, `insert into public.wallet_transactions (user_id, type, amount, balance_after, promo_balance_after, origin) values ('${alice}', 'win', 1, 1, 0, 'dice')`), 'permission denied')
        await rejects(callRpc(db, 'claim_free_credits', { p_user: alice, p_amount: 10000, p_idem: 'rls-attempt-01' }, 'authenticated'), 'permission denied')
        await rejects(callRpc(db, 'account_summary', { p_user: alice }, 'anon'), 'permission denied')
    })
})

describe('rate limits and privacy', () => {
    test('rate limit counter is shared and windowed', async () => {
        const results = []
        for (let i = 0; i < 4; i += 1) results.push(await rpc('rate_limit_hit', { p_key: 'login:ip:abc', p_limit: 3, p_window_seconds: 60 }))
        assert.deepEqual(results.map((r) => r.allowed), [true, true, true, false])
        assert.ok(results[3].retryAfter >= 1)
    })

    test('export lists the user data and erasure removes it while keeping a pseudonymous audit entry', async () => {
        const exported = await rpc('export_user_data', { p_user: bob })
        assert.equal(exported.profile.username, 'bob')
        assert.ok(exported.transactions.length > 0)
        assert.ok(exported.payments.length > 0)
        await rpc('erase_user_data', { p_user: bob })
        for (const table of ['profiles', 'wallets', 'wallet_transactions', 'payment_attempts', 'bonuses']) {
            const column = table === 'profiles' ? 'id' : 'user_id'
            assert.equal((await db.query(`select count(*)::int as n from public.${table} where ${column} = '${bob}'`)).rows[0].n, 0, table)
        }
        assert.equal((await db.query(`select count(*)::int as n from public.audit_logs where target_user_id = '${bob}' and action = 'privacy.erased'`)).rows[0].n, 1)
        await rejects(db.exec(`delete from public.wallet_transactions where user_id = '${alice}'`), 'append_only')
    })
})
