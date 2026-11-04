// Test/dev only: a small stand-in for Supabase Auth (GoTrue REST) and PostgREST /rpc on top of the
// PGlite database, so the account API can be exercised end to end without an external service.
// It mimics the documented behaviour the API relies on (e-mail confirmation, generic sign-up answer
// for existing e-mails, refresh-token rotation, logout scopes), not every GoTrue detail.
import { randomBytes, randomUUID } from 'node:crypto'
import { callRpc } from './pg.js'

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function createEmulator({ db, serviceKey, anonKey, now = Date.now }) {
    const users = new Map() // email -> { id, email, password, confirmedAt }
    const sessions = new Map() // access token -> { userId, refresh }
    const refreshTokens = new Map() // refresh token -> { userId, sessionId }
    const links = new Map() // token hash -> { type, userId }
    const outbox = []

    const userById = (id) => [...users.values()].find((user) => user.id === id)
    const publicUser = (user) => ({ id: user.id, email: user.email, email_confirmed_at: user.confirmedAt, confirmed_at: user.confirmedAt, aud: 'authenticated', role: 'authenticated' })
    const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    function issue(user, sessionId = randomUUID()) {
        const exp = Math.floor(now() / 1000) + 3600
        const access = `${b64({ alg: 'none' })}.${b64({ sub: user.id, exp, session_id: sessionId })}.${randomBytes(8).toString('hex')}`
        const refresh = randomBytes(16).toString('hex')
        sessions.set(access, { userId: user.id, sessionId, exp })
        refreshTokens.set(refresh, { userId: user.id, sessionId })
        return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: publicUser(user) }
    }

    function link(type, user) {
        const tokenHash = randomBytes(20).toString('hex')
        links.set(tokenHash, { type, userId: user.id })
        outbox.push({ to: user.email, type, tokenHash })
    }

    function bearer(init) {
        const token = (init.headers.authorization ?? '').replace(/^Bearer /, '')
        const session = sessions.get(token)
        if (!session || session.exp * 1000 <= now()) return null
        return { token, ...session, user: userById(session.userId) }
    }

    function endSessions(userId, predicate) {
        for (const [token, session] of sessions) if (session.userId === userId && predicate(session)) sessions.delete(token)
        for (const [token, session] of refreshTokens) if (session.userId === userId && predicate(session)) refreshTokens.delete(token)
    }

    async function fetchImpl(target, init = {}) {
        const url = new URL(target)
        const body = init.body ? JSON.parse(init.body) : {}
        const key = init.headers.apikey
        if (key !== anonKey && key !== serviceKey) return reply(401, { message: 'Invalid API key' })
        const route = `${init.method} ${url.pathname}`

        if (url.pathname.startsWith('/rest/v1/rpc/')) {
            if (key !== serviceKey) return reply(401, { code: '42501', message: 'permission denied' })
            try {
                return reply(200, await callRpc(db, url.pathname.slice('/rest/v1/rpc/'.length), body))
            } catch (error) {
                return reply(400, { code: error.code ?? 'XX000', message: error.message })
            }
        }

        switch (route) {
            case 'POST /auth/v1/signup': {
                const email = body.email.toLowerCase()
                if (users.has(email)) {
                    // GoTrue with confirmations on: an obfuscated user, no error, no e-mail to the owner.
                    return reply(200, { id: randomUUID(), email, identities: [] })
                }
                const result = await db.query(
                    'insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id',
                    [email, JSON.stringify(body.data ?? {})],
                )
                const user = { id: result.rows[0].id, email, password: body.password, confirmedAt: null }
                users.set(email, user)
                link('signup', user)
                return reply(200, publicUser(user))
            }
            case 'POST /auth/v1/token': {
                if (url.searchParams.get('grant_type') === 'password') {
                    const user = users.get(String(body.email).toLowerCase())
                    if (!user || user.password !== body.password) return reply(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
                    if (!user.confirmedAt) return reply(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' })
                    return reply(200, issue(user))
                }
                const stored = refreshTokens.get(body.refresh_token)
                if (!stored) return reply(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
                refreshTokens.delete(body.refresh_token)
                for (const [token, session] of sessions) if (session.sessionId === stored.sessionId) sessions.delete(token)
                return reply(200, issue(userById(stored.userId), stored.sessionId))
            }
            case 'GET /auth/v1/user': {
                const session = bearer(init)
                return session?.user ? reply(200, publicUser(session.user)) : reply(401, { error_code: 'bad_jwt', msg: 'invalid JWT' })
            }
            case 'PUT /auth/v1/user': {
                const session = bearer(init)
                if (!session?.user) return reply(401, { error_code: 'bad_jwt' })
                if (body.password) {
                    if (body.password === session.user.password) return reply(422, { error_code: 'same_password' })
                    session.user.password = body.password
                }
                return reply(200, publicUser(session.user))
            }
            case 'POST /auth/v1/logout': {
                const session = bearer(init)
                if (!session) return reply(401, { error_code: 'bad_jwt' })
                const scope = url.searchParams.get('scope') ?? 'global'
                endSessions(session.userId, (other) => scope === 'global' || (scope === 'local' ? other.sessionId === session.sessionId : other.sessionId !== session.sessionId))
                return reply(204)
            }
            case 'POST /auth/v1/recover':
            case 'POST /auth/v1/resend': {
                const user = users.get(String(body.email).toLowerCase())
                if (user) link(route.endsWith('recover') ? 'recovery' : 'signup', user)
                return reply(200, {})
            }
            case 'POST /auth/v1/verify': {
                const pending = links.get(body.token_hash)
                const expected = body.type === 'recovery' ? 'recovery' : 'signup'
                if (!pending || pending.type !== expected) return reply(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
                links.delete(body.token_hash)
                const user = userById(pending.userId)
                if (!user.confirmedAt) {
                    user.confirmedAt = new Date(now()).toISOString()
                    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [user.id])
                }
                return reply(200, issue(user))
            }
            default: {
                const match = /^DELETE \/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(route)
                if (match) {
                    if (key !== serviceKey) return reply(403, { error_code: 'not_admin' })
                    const user = userById(match[1])
                    if (!user) return reply(404, { error_code: 'user_not_found' })
                    endSessions(user.id, () => true)
                    users.delete(user.email)
                    await db.query('delete from auth.users where id = $1', [user.id])
                    return reply(200, {})
                }
                return reply(404, { message: `emulator: no route ${route}` })
            }
        }
    }

    // Local development: a confirmed account, optionally with a staff role.
    async function seedUser({ email, password, username, fullName = 'Conta de teste', role = 'user' }) {
        const result = await db.query(
            'insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2::jsonb) returning id',
            [email, JSON.stringify({ username, full_name: fullName, terms_version: 'local', privacy_version: 'local' })],
        )
        const id = result.rows[0].id
        if (role !== 'user') await db.query('update public.profiles set role = $1 where id = $2', [role, id])
        users.set(email, { id, email, password, confirmedAt: new Date(now()).toISOString() })
        return id
    }

    return { fetch: fetchImpl, outbox, seedUser, lastLink: (email, type) => [...outbox].reverse().find((mail) => mail.to === email && mail.type === type)?.tokenHash }
}
