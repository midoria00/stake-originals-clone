// Minimal client for the two Supabase services the API uses: Auth (GoTrue REST) and the database
// functions (PostgREST /rpc). Server-only: the service key never leaves this process.

export class SupabaseError extends Error {
    constructor(status, body) {
        const code = body?.error_code || body?.code || body?.error || `http_${status}`
        super(typeof code === 'string' ? code : `http_${status}`)
        this.status = status
        // PostgREST puts our P0001 code in "message"; GoTrue uses error_code/msg.
        this.dbCode = body?.code === 'P0001' && /^[a-z_]{3,40}$/.test(body?.message ?? '') ? body.message : null
        this.authCode = typeof body?.error_code === 'string' ? body.error_code : null
    }
}

export function createSupabase({ url, anonKey, serviceKey, fetch: fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
    const base = url.replace(/\/+$/, '')

    async function call(path, { method = 'POST', body, token, key = anonKey, query } = {}) {
        const headers = { apikey: key, accept: 'application/json' }
        if (body !== undefined) headers['content-type'] = 'application/json'
        // Legacy JWT keys also go in Authorization; new sb_secret_/sb_publishable_ keys must not.
        if (token) headers.authorization = `Bearer ${token}`
        else if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
        const target = `${base}${path}${query ? `?${new URLSearchParams(query)}` : ''}`
        const response = await fetchImpl(target, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        })
        const text = await response.text()
        let data = null
        try { data = text ? JSON.parse(text) : null } catch { data = null }
        if (!response.ok) throw new SupabaseError(response.status, data)
        return data
    }

    const withRedirect = (redirectTo) => (redirectTo ? { redirect_to: redirectTo } : undefined)

    return {
        auth: {
            signUp: ({ email, password, data, redirectTo }) => call('/auth/v1/signup', { body: { email, password, data }, query: withRedirect(redirectTo) }),
            signIn: ({ email, password }) => call('/auth/v1/token', { query: { grant_type: 'password' }, body: { email, password } }),
            refresh: (refreshToken) => call('/auth/v1/token', { query: { grant_type: 'refresh_token' }, body: { refresh_token: refreshToken } }),
            getUser: (accessToken) => call('/auth/v1/user', { method: 'GET', token: accessToken }),
            updateUser: (accessToken, attributes) => call('/auth/v1/user', { method: 'PUT', token: accessToken, body: attributes }),
            logout: (accessToken, scope = 'local') => call('/auth/v1/logout', { token: accessToken, query: { scope } }),
            recover: ({ email, redirectTo }) => call('/auth/v1/recover', { body: { email }, query: withRedirect(redirectTo) }),
            resend: ({ email, redirectTo }) => call('/auth/v1/resend', { body: { type: 'signup', email }, query: withRedirect(redirectTo) }),
            verify: ({ type, tokenHash }) => call('/auth/v1/verify', { body: { type, token_hash: tokenHash } }),
            deleteUser: (userId) => call(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', key: serviceKey }),
        },
        rpc: (fn, args = {}) => call(`/rest/v1/rpc/${fn}`, { body: args, key: serviceKey }),
    }
}
