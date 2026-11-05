// Request/response helpers for the account API: JSON bodies, cookies, CSRF and origin checks,
// client IP hashing and error responses.
import { createHmac, randomUUID } from 'node:crypto'

export class ApiError extends Error {
    constructor(status, code, extra = {}) {
        super(code)
        this.status = status
        this.code = code
        this.extra = extra
    }
}

const MAX_BODY_BYTES = 16 * 1024

export function json(status, body, { cookies = [], headers = {} } = {}) {
    const response = new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-robots-tag': 'noindex',
            ...headers,
        },
    })
    for (const cookie of cookies) response.headers.append('set-cookie', cookie)
    return response
}

export async function readJson(request) {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) throw new ApiError(415, 'json_required')
    const declared = Number(request.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES) throw new ApiError(413, 'body_too_large')
    const text = await request.text()
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new ApiError(413, 'body_too_large')
    let body
    try { body = text ? JSON.parse(text) : {} } catch { throw new ApiError(400, 'invalid_json') }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_json')
    return body
}

// State-changing requests must come from this site: same-origin Origin header plus a custom header
// (a cross-site form or fetch cannot set it without a CORS preflight, which this API never grants).
export function assertSameOrigin(request) {
    if (request.method === 'GET' || request.method === 'HEAD') return
    const origin = request.headers.get('origin')
    let host
    try { host = new URL(request.url).host } catch { throw new ApiError(400, 'bad_request') }
    let originHost = null
    try { originHost = origin ? new URL(origin).host : null } catch { originHost = null }
    if (!originHost || originHost !== host || request.headers.get('x-requested-with') !== '123bet') {
        throw new ApiError(403, 'origin_rejected')
    }
}

export function originOf(request) {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
}

export function parseCookies(request) {
    const out = {}
    for (const part of (request.headers.get('cookie') ?? '').split(';')) {
        const index = part.indexOf('=')
        if (index < 1) continue
        const name = part.slice(0, index).trim()
        if (!(name in out)) out[name] = decodeURIComponent(part.slice(index + 1).trim())
    }
    return out
}

export function serializeCookie(name, value, { maxAge, sameSite = 'Lax' } = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', `SameSite=${sameSite}`]
    if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
    return parts.join('; ')
}

export function clientIp(request) {
    const real = request.headers.get('x-real-ip')
    if (real) return real.trim()
    const forwarded = request.headers.get('x-forwarded-for')
    return forwarded ? forwarded.split(',')[0].trim() : 'local'
}

// Raw IPs are never stored: rate-limit keys and audit entries use a keyed hash.
export const hashValue = (secret, value) => createHmac('sha256', secret).update(String(value)).digest('hex').slice(0, 32)

export const requestId = () => randomUUID()
