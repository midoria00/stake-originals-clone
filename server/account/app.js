// 123bet account API (/api/app/*): authentication, profile, wallet, history, promotions, payment
// sandbox, test-only withdrawals, administration and server-authoritative game rounds.
// Supabase Auth issues the sessions; this API keeps them in httpOnly cookies and calls the database
// functions with the service role after authenticating and authorizing every request.
import { timingSafeEqual } from 'node:crypto'
import { ApiError, assertSameOrigin, clientIp, hashValue, json, originOf, readJson, requestId } from './http.js'
import { clearedCookies, resolveSession, sessionCookies } from './session.js'
import { createSupabase, SupabaseError } from './supabase.js'
import { createSandboxProvider, recordEvent } from './payments.js'
import * as games from './games.js'
import { placeSportsBet, settleOpenBets } from './sports.js'
import { createSportsService } from '../sports/service.js'
import * as v from './validate.js'

const STATUS_BY_CODE = {
    insufficient_funds: 409, ceiling_reached: 409, round_already_open: 409, round_conflict: 409, tile_revealed: 409,
    nothing_to_cash_out: 409, coupon_exhausted: 409, coupon_already_redeemed: 409, cashback_already_claimed: 409,
    cashback_unavailable: 409, invalid_transition: 409, self_adjustment_forbidden: 403, forbidden: 403,
    round_not_found: 404, profile_not_found: 403, user_not_found: 404, withdrawal_not_found: 404, bet_not_found: 404,
    too_many_pending: 429, wallet_not_found: 403,
}
const TX_TYPES = ['welcome', 'free_credit', 'bet', 'win', 'refund', 'bonus', 'bonus_expired', 'admin_adjustment']
const ORIGINS = ['wallet', 'crash', 'plinko', 'mines', 'dino', 'dice', 'limbo', 'sports', 'coupon', 'cashback', 'admin', 'system']
const GAMES = ['crash', 'plinko', 'mines', 'dino', 'dice', 'limbo']

export function readConfig(env = process.env) {
    const url = env.SUPABASE_URL?.trim() ?? ''
    const anonKey = (env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '').trim()
    const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '').trim()
    const hashSecret = env.ACCOUNT_HASH_SECRET?.trim() ?? ''
    const enabled = /^https:\/\/[^\s/]+$/.test(url.replace(/\/+$/, '')) && anonKey.length > 20 && serviceKey.length > 20 && hashSecret.length >= 32
    return {
        enabled,
        url, anonKey, serviceKey, hashSecret,
        sandboxSecret: env.PAYMENT_SANDBOX_WEBHOOK_SECRET?.trim() ?? '',
        cronSecret: env.CRON_SECRET?.trim() ?? '',
    }
}

// snake_case rows from to_jsonb -> camelCase; the round secret never leaves the server.
function camel(value) {
    if (Array.isArray(value)) return value.map(camel)
    if (!value || typeof value !== 'object') return value
    const out = {}
    for (const [key, item] of Object.entries(value)) {
        if (key === 'secret') continue
        out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = camel(item)
    }
    return out
}

const equalSecret = (a, b) => {
    const left = Buffer.from(String(a))
    const right = Buffer.from(String(b))
    return left.length === right.length && timingSafeEqual(left, right)
}

// Handlers ---------------------------------------------------------------------------------------

async function limit(ctx, bucket, key, max, windowSeconds) {
    const result = await ctx.rpc('rate_limit_hit', { p_key: `${bucket}:${key}`, p_limit: max, p_window_seconds: windowSeconds })
    if (!result.allowed) throw new ApiError(429, 'rate_limited', { retryAfter: result.retryAfter })
}
const limitIp = (ctx, bucket, max, windowSeconds) => limit(ctx, bucket, `ip:${ctx.ipHash}`, max, windowSeconds)
const limitEmail = (ctx, bucket, mail, max, windowSeconds) => limit(ctx, bucket, `email:${hashValue(ctx.config.hashSecret, mail)}`, max, windowSeconds)
const limitUser = (ctx, bucket, max, windowSeconds) => limit(ctx, bucket, `user:${ctx.userId}`, max, windowSeconds)

const audit = (ctx, action, details = {}, target = ctx.userId) => ctx.rpc('audit_log', {
    p_actor: ctx.userId ?? null, p_role: ctx.role ?? 'user', p_action: action, p_target_user: target ?? null,
    p_target_type: 'profile', p_target_id: target ?? null, p_details: details, p_ip_hash: ctx.ipHash,
})

async function mePayload(ctx, user) {
    try {
        const summary = await ctx.rpc('account_summary', { p_user: user.id })
        return { user: { id: user.id, email: user.email, emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at) }, ...camel(summary) }
    } catch (error) {
        if (error instanceof ApiError && error.code === 'profile_not_found') {
            ctx.cookies.push(...clearedCookies())
            throw new ApiError(403, 'account_unavailable')
        }
        throw error
    }
}

function authError(error, fallback = 'auth_failed') {
    if (!(error instanceof SupabaseError)) return error
    if (error.status >= 500 || !error.status) return new ApiError(503, 'auth_unavailable')
    const code = error.authCode
    if (code === 'weak_password') return new ApiError(400, 'weak_password')
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) return new ApiError(429, 'rate_limited', { retryAfter: 60 })
    if (code === 'signup_disabled') return new ApiError(503, 'signup_disabled')
    if (code === 'same_password') return new ApiError(400, 'same_password')
    return new ApiError(400, fallback)
}

const authRoutes = {
    'GET auth/config': {
        auth: 'public',
        run: (ctx) => ({ enabled: ctx.config.enabled, termsVersion: v.TERMS_VERSION, privacyVersion: v.PRIVACY_VERSION, passwordMinLength: 10 }),
    },
    'GET me': {
        auth: 'optional',
        run: async (ctx) => (ctx.user ? mePayload(ctx, ctx.user) : { user: null }),
    },
    'POST auth/signup': {
        auth: 'public',
        run: async (ctx, body) => {
            const mail = v.email(body.email)
            const name = v.username(body.username)
            const full = v.fullName(body.fullName)
            const pass = v.password(body.password, { email: mail, username: name })
            if (body.password !== body.passwordConfirm) v.fail('password_mismatch')
            if (body.acceptTerms !== true || body.acceptPrivacy !== true) v.fail('terms_required')
            await limitIp(ctx, 'signup', 5, 3600)
            await limitEmail(ctx, 'signup', mail, 3, 3600)
            if (!(await ctx.rpc('username_available', { p_username: name }))) v.fail('username_taken', 409)
            let result
            try {
                result = await ctx.sb.auth.signUp({
                    email: mail, password: pass, redirectTo: `${originOf(ctx.request)}/conta/confirmar`,
                    data: { username: name, full_name: full, terms_version: v.TERMS_VERSION, privacy_version: v.PRIVACY_VERSION },
                })
            } catch (error) {
                // An existing e-mail gets the same answer as a new one (no account enumeration).
                if (error instanceof SupabaseError && (error.authCode === 'user_already_exists' || error.authCode === 'email_exists')) return { status: 'check_email' }
                throw authError(error, 'signup_failed')
            }
            if (result?.access_token) {
                ctx.cookies.push(...sessionCookies(result))
                return { status: 'signed_in' }
            }
            return { status: 'check_email' }
        },
    },
    'POST auth/login': {
        auth: 'public',
        run: async (ctx, body) => {
            const mail = v.email(body.email)
            if (typeof body.password !== 'string' || !body.password || body.password.length > 200) v.fail('invalid_credentials')
            await limitIp(ctx, 'login', 20, 900)
            await limitEmail(ctx, 'login', mail, 8, 900)
            let session
            try {
                session = await ctx.sb.auth.signIn({ email: mail, password: body.password })
            } catch (error) {
                // Wrong password, unknown e-mail and unconfirmed e-mail share one answer.
                throw authError(error, 'invalid_credentials')
            }
            ctx.cookies.push(...sessionCookies(session))
            ctx.userId = session.user.id
            const payload = await mePayload(ctx, session.user)
            ctx.role = payload.profile.role
            await audit(ctx, 'auth.login')
            return payload
        },
    },
    'POST auth/logout': {
        auth: 'optional',
        run: async (ctx) => {
            if (ctx.accessToken) {
                await ctx.sb.auth.logout(ctx.accessToken, 'local').catch(() => {})
                await audit(ctx, 'auth.logout')
            }
            ctx.cookies.push(...clearedCookies())
            return { status: 'signed_out' }
        },
    },
    'POST auth/logout-all': {
        auth: 'user',
        run: async (ctx) => {
            await ctx.sb.auth.logout(ctx.accessToken, 'global').catch((error) => { throw authError(error) })
            await audit(ctx, 'auth.logout_all')
            ctx.cookies.push(...clearedCookies())
            return { status: 'signed_out' }
        },
    },
    'POST auth/recover': {
        auth: 'public',
        run: async (ctx, body) => {
            const mail = v.email(body.email)
            await limitIp(ctx, 'recover', 5, 3600)
            await limitEmail(ctx, 'recover', mail, 3, 3600)
            await ctx.sb.auth.recover({ email: mail, redirectTo: `${originOf(ctx.request)}/conta/redefinir-senha` }).catch((error) => {
                if (!(error instanceof SupabaseError) || error.status >= 500) throw authError(error)
            })
            return { status: 'check_email' }
        },
    },
    'POST auth/resend': {
        auth: 'public',
        run: async (ctx, body) => {
            const mail = v.email(body.email)
            await limitIp(ctx, 'resend', 5, 3600)
            await limitEmail(ctx, 'resend', mail, 3, 3600)
            await ctx.sb.auth.resend({ email: mail, redirectTo: `${originOf(ctx.request)}/conta/confirmar` }).catch((error) => {
                if (!(error instanceof SupabaseError) || error.status >= 500) throw authError(error)
            })
            return { status: 'check_email' }
        },
    },
    'POST auth/confirm': {
        auth: 'public',
        run: async (ctx, body) => {
            await limitIp(ctx, 'confirm', 20, 3600)
            const session = await sessionFromLink(ctx, body, 'email')
            ctx.cookies.push(...sessionCookies(session))
            ctx.userId = session.user.id
            await audit(ctx, 'auth.email_confirmed')
            return mePayload(ctx, session.user)
        },
    },
    'POST auth/reset': {
        auth: 'public',
        run: async (ctx, body) => {
            await limitIp(ctx, 'reset', 10, 3600)
            if (body.password !== body.passwordConfirm) v.fail('password_mismatch')
            const session = await sessionFromLink(ctx, body, 'recovery')
            const pass = v.password(body.password, { email: session.user.email })
            await ctx.sb.auth.updateUser(session.access_token, { password: pass }).catch((error) => { throw authError(error, 'reset_failed') })
            // Every other session of the account ends with the old password.
            await ctx.sb.auth.logout(session.access_token, 'others').catch(() => {})
            ctx.cookies.push(...sessionCookies(session))
            ctx.userId = session.user.id
            await audit(ctx, 'auth.password_reset')
            return mePayload(ctx, session.user)
        },
    },
    'POST auth/password': {
        auth: 'user',
        run: async (ctx, body) => {
            await limitUser(ctx, 'password', 5, 900)
            if (body.newPassword !== body.passwordConfirm) v.fail('password_mismatch')
            const pass = v.password(body.newPassword, { email: ctx.user.email })
            let session
            try {
                session = await ctx.sb.auth.signIn({ email: ctx.user.email, password: String(body.currentPassword ?? '') })
            } catch (error) {
                throw authError(error, 'invalid_credentials')
            }
            await ctx.sb.auth.updateUser(session.access_token, { password: pass }).catch((error) => { throw authError(error, 'password_change_failed') })
            await ctx.sb.auth.logout(session.access_token, 'others').catch(() => {})
            ctx.cookies.push(...sessionCookies(session))
            await audit(ctx, 'auth.password_changed')
            return { status: 'password_changed' }
        },
    },
}

// E-mail links arrive either as token_hash (custom templates, recommended) or as tokens in the URL
// fragment (Supabase default templates); both end in a verified Supabase session.
async function sessionFromLink(ctx, body, type) {
    try {
        if (typeof body.tokenHash === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(body.tokenHash)) {
            return await ctx.sb.auth.verify({ type, tokenHash: body.tokenHash })
        }
        if (typeof body.accessToken === 'string' && typeof body.refreshToken === 'string' && body.accessToken.length < 4096 && body.refreshToken.length < 512) {
            const user = await ctx.sb.auth.getUser(body.accessToken)
            return { access_token: body.accessToken, refresh_token: body.refreshToken, expires_in: v.int(body.expiresIn ?? 3600, 60, 86400, 'invalid_link'), user }
        }
    } catch (error) {
        throw authError(error, 'invalid_link')
    }
    throw new ApiError(400, 'invalid_link')
}

const accountRoutes = {
    'PATCH account/profile': {
        auth: 'user',
        run: async (ctx, body) => camel(await ctx.rpc('update_profile', { p_user: ctx.userId, p_full_name: v.fullName(body.fullName) })),
    },
    'PATCH account/settings': {
        auth: 'user',
        run: async (ctx, body) => camel(await ctx.rpc('update_settings', { p_user: ctx.userId, p_settings: body })),
    },
    'GET account/export': {
        auth: 'user',
        run: async (ctx) => {
            await limitUser(ctx, 'export', 5, 3600)
            const data = camel(await ctx.rpc('export_user_data', { p_user: ctx.userId }))
            return new Response(JSON.stringify({ ...data, email: ctx.user.email }, null, 2), {
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                    'content-disposition': `attachment; filename="123bet-meus-dados-${new Date(ctx.now()).toISOString().slice(0, 10)}.json"`,
                    'cache-control': 'no-store',
                },
            })
        },
    },
    'POST account/delete': {
        auth: 'user',
        run: async (ctx, body) => {
            await limitUser(ctx, 'delete', 5, 3600)
            if (body.confirmation !== 'EXCLUIR') v.fail('confirmation_required')
            try {
                await ctx.sb.auth.signIn({ email: ctx.user.email, password: String(body.password ?? '') })
            } catch (error) {
                throw authError(error, 'invalid_credentials')
            }
            await ctx.rpc('erase_user_data', { p_user: ctx.userId })
            let authDeleted = true
            await ctx.sb.auth.deleteUser(ctx.userId).catch((error) => {
                authDeleted = false
                ctx.logError('account/delete', 'auth_delete_failed', error.message)
            })
            ctx.cookies.push(...clearedCookies())
            return { status: 'erased', authDeleted }
        },
    },
    'GET wallet': {
        auth: 'user',
        run: async (ctx) => {
            const [summary, stats] = await Promise.all([
                ctx.rpc('account_summary', { p_user: ctx.userId }),
                ctx.rpc('game_stats', { p_user: ctx.userId }),
            ])
            return { wallet: summary.wallet, bonuses: summary.bonuses, stats }
        },
    },
    'POST wallet/free-credits': {
        auth: 'user',
        run: async (ctx, body) => {
            await limitUser(ctx, 'free', 30, 3600)
            const cents = v.coinsToCents(body.amount)
            return camel(await ctx.rpc('claim_free_credits', { p_user: ctx.userId, p_amount: cents, p_idem: v.idempotencyKey(body.idempotencyKey) }))
        },
    },
    'GET wallet/transactions': {
        auth: 'user',
        run: async (ctx) => {
            const q = ctx.url.searchParams
            const list = (name, allowed) => {
                const raw = q.get(name)
                if (!raw) return null
                const items = raw.split(',')
                if (items.length > allowed.length || !items.every((item) => allowed.includes(item))) v.fail(`invalid_${name}`)
                return items
            }
            const date = (name) => {
                const raw = q.get(name)
                if (!raw) return null
                if (!Number.isFinite(Date.parse(raw))) v.fail(`invalid_${name}`)
                return new Date(raw).toISOString()
            }
            const cursor = q.get('cursor') ? v.int(q.get('cursor'), 1, Number.MAX_SAFE_INTEGER, 'invalid_cursor') : null
            const result = await ctx.rpc('list_transactions', {
                p_user: ctx.userId, p_types: list('types', TX_TYPES), p_origins: list('origins', ORIGINS),
                p_from: date('from'), p_to: date('to'), p_cursor: cursor, p_limit: v.int(q.get('limit') ?? 25, 1, 100, 'invalid_limit'),
            })
            const items = camel(result.items)
            return { items, nextCursor: result.hasMore ? items.at(-1).seq : null }
        },
    },
    'GET history/rounds': {
        auth: 'user',
        run: async (ctx) => {
            const q = ctx.url.searchParams
            const game = q.get('game') ? v.oneOf(q.get('game'), GAMES, 'invalid_game') : null
            const [at, id] = keysetCursor(q.get('cursor'))
            const result = await ctx.rpc('list_rounds', { p_user: ctx.userId, p_game: game, p_cursor_at: at, p_cursor_id: id, p_limit: v.int(q.get('limit') ?? 25, 1, 100, 'invalid_limit') })
            const last = result.items.at(-1)
            return { items: result.items, nextCursor: result.hasMore ? `${last.createdAt}|${last.id}` : null }
        },
    },
    'GET history/sports': {
        auth: 'user',
        run: async (ctx) => {
            const q = ctx.url.searchParams
            const status = q.get('status') ? v.oneOf(q.get('status'), ['open', 'won', 'lost', 'void', 'partial'], 'invalid_status') : null
            const [at, id] = keysetCursor(q.get('cursor'))
            // Lazy settlement; a sports provider failure must not break the listing.
            await settleOpenBets(ctx, ctx.userId).catch((error) => ctx.logError('history/sports', 'settle_failed', error?.message))
            const result = await ctx.rpc('list_sports_bets', { p_user: ctx.userId, p_status: status, p_cursor_at: at, p_cursor_id: id, p_limit: v.int(q.get('limit') ?? 25, 1, 100, 'invalid_limit') })
            const last = result.items.at(-1)
            return { items: result.items, nextCursor: result.hasMore ? `${last.createdAt}|${last.id}` : null }
        },
    },
    'GET promotions': {
        auth: 'user',
        run: async (ctx) => {
            const [promotions, cashback] = await Promise.all([
                ctx.rpc('list_promotions', { p_user: ctx.userId }),
                ctx.rpc('cashback_status', { p_user: ctx.userId }),
            ])
            return camel({ ...promotions, cashback })
        },
    },
    'POST promotions/coupon': {
        auth: 'user',
        run: async (ctx, body) => {
            await limitUser(ctx, 'coupon', 10, 3600)
            const code = v.text(body.code, { min: 4, max: 24, code: 'coupon_invalid' }).toUpperCase()
            if (!/^[A-Z0-9_-]{4,24}$/.test(code)) v.fail('coupon_invalid')
            return camel(await ctx.rpc('coupon_redeem', { p_user: ctx.userId, p_code: code }))
        },
    },
    'POST promotions/cashback': {
        auth: 'user',
        run: async (ctx) => {
            await limitUser(ctx, 'cashback', 10, 3600)
            return camel(await ctx.rpc('cashback_claim', { p_user: ctx.userId }))
        },
    },
    'GET withdrawals': {
        auth: 'user',
        run: () => ({ available: false, reason: 'financial_operations_disabled' }),
    },
}

function keysetCursor(raw) {
    if (!raw) return [null, null]
    const [at, id] = raw.split('|')
    if (!Number.isFinite(Date.parse(at))) v.fail('invalid_cursor')
    return [new Date(at).toISOString(), v.uuid(id, 'invalid_cursor')]
}

const paymentRoutes = {
    'GET payments': {
        auth: 'user',
        run: async (ctx) => ({ sandbox: true, items: camel(await ctx.rpc('list_payments', { p_user: ctx.userId, p_limit: 20 })) }),
    },
    'GET payments/detail': {
        auth: 'user',
        run: async (ctx) => {
            const detail = await ctx.rpc('payment_get', { p_user: ctx.userId, p_attempt: v.uuid(ctx.url.searchParams.get('id')) })
            if (!detail) throw new ApiError(404, 'payment_not_found')
            const provider = createSandboxProvider({ secret: ctx.config.sandboxSecret })
            return camel({ ...detail, instructions: provider.createPayment({ attempt: detail.attempt }).instructions })
        },
    },
    'POST payments': {
        auth: 'user',
        run: async (ctx, body) => {
            await limitUser(ctx, 'payment', 30, 3600)
            const provider = createSandboxProvider({ secret: ctx.config.sandboxSecret })
            const method = v.oneOf(body.method, ['pix_simulado', 'cartao_simulado'], 'invalid_method')
            const cents = v.coinsToCents(body.amount)
            if (cents < 100 || cents > 100000) v.fail('invalid_amount')
            const created = await ctx.rpc('payment_create', {
                p_user: ctx.userId, p_method: method, p_amount_cents: cents, p_provider_ref: `sbx_${crypto.randomUUID()}`,
                p_ttl_seconds: 900, p_idem: v.idempotencyKey(body.idempotencyKey),
            })
            return camel({ ...created, sandbox: true, instructions: provider.createPayment({ attempt: created.attempt }).instructions })
        },
    },
    'POST payments/simulate': {
        auth: 'user',
        run: async (ctx, body) => {
            await limitUser(ctx, 'payment-sim', 60, 3600)
            const provider = createSandboxProvider({ secret: ctx.config.sandboxSecret })
            const action = v.oneOf(body.action, ['confirm', 'fail', 'cancel', 'expire', 'refund'], 'invalid_action')
            const id = v.uuid(body.id)
            const detail = await ctx.rpc('payment_get', { p_user: ctx.userId, p_attempt: id })
            if (!detail) throw new ApiError(404, 'payment_not_found')
            // Goes through the same signature check as an external webhook call.
            const { rawBody, signature } = provider.buildEvent(action, detail.attempt, ctx.now())
            const event = provider.verifyWebhook({ signature, rawBody, now: ctx.now() })
            const outcome = await recordEvent(ctx.rpc, provider, event)
            const updated = await ctx.rpc('payment_get', { p_user: ctx.userId, p_attempt: id })
            return camel({ outcome, ...updated })
        },
    },
    'POST payments/webhook/sandbox': {
        auth: 'public',
        csrf: false,
        raw: true,
        run: async (ctx) => {
            await limitIp(ctx, 'webhook', 120, 60)
            const provider = createSandboxProvider({ secret: ctx.config.sandboxSecret })
            const rawBody = await ctx.request.text()
            if (Buffer.byteLength(rawBody) > 16 * 1024) throw new ApiError(413, 'body_too_large')
            const event = provider.verifyWebhook({ signature: ctx.request.headers.get('x-sandbox-signature'), rawBody, now: ctx.now() })
            return { received: true, ...(await recordEvent(ctx.rpc, provider, event)) }
        },
    },
}

const gameRoutes = {
    'POST sports/bets': { auth: 'user', game: true, run: (ctx, body) => placeSportsBet(ctx, body) },
    'POST games/dice': { auth: 'user', game: true, run: (ctx, body) => games.playDice(ctx, body) },
    'POST games/limbo': { auth: 'user', game: true, run: (ctx, body) => games.playLimbo(ctx, body) },
    'POST games/plinko': { auth: 'user', game: true, run: (ctx, body) => games.playPlinko(ctx, body) },
    'POST games/mines/start': { auth: 'user', game: true, run: (ctx, body) => games.minesStart(ctx, body) },
    'POST games/mines/reveal': { auth: 'user', game: true, run: (ctx, body) => games.minesReveal(ctx, body) },
    'POST games/mines/cashout': { auth: 'user', game: true, run: (ctx, body) => games.minesCashoutRoute(ctx, body) },
    'GET games/mines/current': { auth: 'user', run: (ctx) => games.currentRound(ctx, 'mines') },
    'POST games/crash/start': { auth: 'user', game: true, run: (ctx, body) => games.crashStart(ctx, body) },
    'POST games/crash/cashout': { auth: 'user', game: true, run: (ctx, body) => games.crashCashout(ctx, body) },
    'POST games/crash/watch': { auth: 'user', run: (ctx, body) => games.crashWatch(ctx, body) },
    'GET games/crash/current': { auth: 'user', run: (ctx) => games.currentRound(ctx, 'crash') },
    'POST games/dino/start': { auth: 'user', game: true, run: (ctx, body) => games.dinoStart(ctx, body) },
    'POST games/dino/jump': { auth: 'user', game: true, run: (ctx, body) => games.dinoJump(ctx, body) },
    'POST games/dino/cashout': { auth: 'user', game: true, run: (ctx, body) => games.dinoCashoutRoute(ctx, body) },
    'GET games/dino/current': { auth: 'user', run: (ctx) => games.currentRound(ctx, 'dino') },
}

const offset = (ctx) => v.int(ctx.url.searchParams.get('offset') ?? 0, 0, 100000, 'invalid_offset')

const adminRoutes = {
    'GET admin/overview': { auth: 'staff', run: async (ctx) => ({ role: ctx.role, metrics: await ctx.rpc('admin_metrics', { p_actor: ctx.userId }) }) },
    'GET admin/users': {
        auth: 'staff',
        run: async (ctx) => {
            const query = ctx.url.searchParams.get('q')
            return { items: await ctx.rpc('admin_users', { p_actor: ctx.userId, p_query: query ? v.text(query, { max: 40, code: 'invalid_query' }).replace(/[%_\\]/g, '') : null, p_offset: offset(ctx), p_limit: 25 }) }
        },
    },
    'GET admin/user': { auth: 'staff', run: async (ctx) => camel(await ctx.rpc('admin_user_detail', { p_actor: ctx.userId, p_user: v.uuid(ctx.url.searchParams.get('id')) })) },
    'GET admin/transactions': {
        auth: 'staff',
        run: async (ctx) => {
            const q = ctx.url.searchParams
            return { items: camel(await ctx.rpc('admin_transactions', {
                p_actor: ctx.userId, p_user: q.get('user') ? v.uuid(q.get('user')) : null,
                p_type: q.get('type') ? v.oneOf(q.get('type'), TX_TYPES, 'invalid_type') : null, p_offset: offset(ctx), p_limit: 50,
            })) }
        },
    },
    'GET admin/payment-events': { auth: 'staff', run: async (ctx) => ({ items: await ctx.rpc('admin_payment_events', { p_actor: ctx.userId, p_offset: offset(ctx), p_limit: 50 }) }) },
    'GET admin/errors': { auth: 'staff', run: async (ctx) => ({ items: camel(await ctx.rpc('admin_errors', { p_actor: ctx.userId, p_offset: offset(ctx), p_limit: 50 })) }) },
    'GET admin/audit': { auth: 'staff', run: async (ctx) => ({ items: camel(await ctx.rpc('admin_audit', { p_actor: ctx.userId, p_offset: offset(ctx), p_limit: 50 })) }) },
    'GET admin/coupons': { auth: 'staff', run: async (ctx) => ({ items: camel(await ctx.rpc('admin_coupons', { p_actor: ctx.userId })) }) },
    'POST admin/coupons': {
        auth: 'admin',
        run: async (ctx, body) => {
            const code = v.text(body.code, { min: 4, max: 24, code: 'invalid_coupon' }).toUpperCase()
            if (!/^[A-Z0-9_-]{4,24}$/.test(code)) v.fail('invalid_coupon')
            const validUntil = Date.parse(body.validUntil)
            if (!Number.isFinite(validUntil)) v.fail('invalid_coupon')
            return camel(await ctx.rpc('admin_coupon_upsert', {
                p_actor: ctx.userId,
                p_data: {
                    code, description: v.text(body.description, { min: 4, max: 200, code: 'invalid_coupon' }),
                    amount: v.coinsToCents(body.amount, 'invalid_coupon'), bonusDays: v.int(body.bonusDays ?? 7, 1, 90, 'invalid_coupon'),
                    maxRedemptions: v.int(body.maxRedemptions, 1, 1000000, 'invalid_coupon'), perUserLimit: v.int(body.perUserLimit ?? 1, 1, 10, 'invalid_coupon'),
                    validFrom: body.validFrom ? new Date(Date.parse(body.validFrom) || ctx.now()).toISOString() : null,
                    validUntil: new Date(validUntil).toISOString(), active: body.active !== false,
                },
            }))
        },
    },
    'POST admin/adjust': {
        auth: 'admin',
        run: async (ctx, body) => {
            const raw = String(body.amount ?? '').trim()
            const negative = raw.startsWith('-')
            const cents = v.coinsToCents(negative ? raw.slice(1) : raw)
            return camel(await ctx.rpc('admin_adjust_wallet', {
                p_actor: ctx.userId, p_user: v.uuid(body.userId), p_amount: negative ? -cents : cents,
                p_reason: v.text(body.reason, { min: 10, max: 200, code: 'invalid_reason' }), p_idem: v.idempotencyKey(body.idempotencyKey),
            }))
        },
    },
    'GET admin/withdrawals': { auth: 'staff', run: async (ctx) => ({ testOnly: true, items: camel(await ctx.rpc('admin_withdrawals', { p_actor: ctx.userId })) }) },
    'POST admin/withdrawals': {
        auth: 'staff',
        run: async (ctx, body) => {
            const cents = v.coinsToCents(body.amount)
            if (cents < 100 || cents > 100000) v.fail('invalid_amount')
            return camel(await ctx.rpc('withdrawal_create', { p_actor: ctx.userId, p_amount_cents: cents, p_note: body.note ? v.text(body.note, { max: 300, code: 'invalid_note' }) : null }))
        },
    },
    'POST admin/withdrawals/transition': {
        auth: 'staff',
        run: async (ctx, body) => camel(await ctx.rpc('withdrawal_transition', {
            p_actor: ctx.userId, p_id: v.uuid(body.id), p_to: v.oneOf(body.to, ['in_review', 'approved', 'rejected', 'cancelled', 'completed'], 'invalid_transition'),
            p_note: body.note ? v.text(body.note, { max: 300, code: 'invalid_note' }) : null,
        })),
    },
    'POST admin/reconcile': {
        auth: 'admin',
        run: async (ctx) => {
            const report = await ctx.rpc('payment_reconcile')
            await audit(ctx, 'admin.payments_reconciled', { expired: report.expired, mismatches: report.mismatches.length }, null)
            return report
        },
    },
    'GET admin/catalog': {
        auth: 'staff',
        run: async () => {
            const { catalogStatus } = await import('../casino/admin.js')
            const { createCasinoService, loadCatalog } = await import('../casino/service.js')
            const catalog = loadCatalog()
            return catalogStatus(createCasinoService({ catalog }), catalog)
        },
    },
    'GET cron/maintenance': {
        auth: 'cron',
        run: async (ctx) => {
            const maintenance = await ctx.rpc('purge_expired')
            const sports = await settleOpenBets(ctx, null).catch((error) => { ctx.logError('cron/maintenance', 'sports_settle_failed', error?.message) })
            return { maintenance, sports: sports ?? null }
        },
    },
}

export const ROUTES = { ...authRoutes, ...accountRoutes, ...paymentRoutes, ...gameRoutes, ...adminRoutes }

// Dispatcher -------------------------------------------------------------------------------------

function routeKey(request, url) {
    const fromQuery = url.searchParams.get('route')
    const path = (fromQuery ?? url.pathname.replace(/^\/api\/app\/?/, '')).replace(/^\/+|\/+$/g, '')
    return `${request.method} ${path}`
}

export function createAccountApp({ env = process.env, fetch, rng = games.cryptoRng, now = Date.now, sleep, sports = createSportsService({ env, now }) } = {}) {
    const config = readConfig(env)
    const sb = config.enabled ? createSupabase({ url: config.url, anonKey: config.anonKey, serviceKey: config.serviceKey, fetch }) : null
    const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    return { config, handle: (request) => dispatch(request, { config, sb, rng, now, sleep: wait, sports }) }
}

async function dispatch(request, deps) {
    const id = requestId()
    const url = new URL(request.url)
    const key = routeKey(request, url)
    const route = ROUTES[key]
    const ctx = {
        ...deps, request, url, cookies: [], userId: null, role: null, user: null, accessToken: null,
        rpc: async (fn, args) => {
            try {
                return await deps.sb.rpc(fn, args)
            } catch (error) {
                if (error instanceof SupabaseError && error.dbCode) throw new ApiError(STATUS_BY_CODE[error.dbCode] ?? 400, error.dbCode)
                throw error
            }
        },
        logError: (where, code, message) => {
            console.error(`[account] ${id} ${where} ${code}`)
            deps.sb?.rpc('log_error', { p_route: where, p_code: code, p_message: String(message ?? '').slice(0, 500), p_request_id: id }).catch(() => {})
        },
    }
    const respond = (status, body) => json(status, body, { cookies: ctx.cookies, headers: { 'x-request-id': id } })

    try {
        if (!route) throw new ApiError(404, 'not_found')
        if (!deps.config.enabled && key !== 'GET auth/config') {
            if (key === 'GET me') return respond(200, { user: null, accountsEnabled: false })
            throw new ApiError(503, 'accounts_disabled')
        }
        if (route.csrf !== false) assertSameOrigin(request)
        ctx.ipHash = deps.config.hashSecret ? hashValue(deps.config.hashSecret, clientIp(request)) : null

        if (route.auth === 'cron') {
            const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '')
            if (deps.config.cronSecret.length < 32 || !equalSecret(given, deps.config.cronSecret)) throw new ApiError(401, 'unauthorized')
        } else if (route.auth !== 'public') {
            const session = await resolveSession(request, deps.sb, deps.now())
            ctx.cookies.push(...session.cookies)
            ctx.user = session.user
            ctx.accessToken = session.accessToken
            ctx.userId = session.user?.id ?? null
            if (route.auth !== 'optional' && !ctx.userId) throw new ApiError(401, 'unauthenticated')
            if (route.auth === 'staff' || route.auth === 'admin') {
                ctx.role = await ctx.rpc('get_role', { p_user: ctx.userId })
                const allowed = route.auth === 'admin' ? ['admin'] : ['support', 'admin']
                if (!allowed.includes(ctx.role)) throw new ApiError(403, 'forbidden')
                await limitUser(ctx, 'admin', 300, 60)
            }
            if (route.game) await limitUser(ctx, 'games', 900, 60)
        }

        const body = request.method === 'GET' || route.raw ? {} : await readJson(request)
        const result = await route.run(ctx, body)
        if (result instanceof Response) {
            for (const cookie of ctx.cookies) result.headers.append('set-cookie', cookie)
            return result
        }
        return respond(200, result)
    } catch (error) {
        if (error instanceof ApiError) return respond(error.status, { error: error.code, ...error.extra })
        ctx.logError(key, error?.name ?? 'Error', error?.message)
        return respond(500, { error: 'internal', requestId: id })
    }
}
