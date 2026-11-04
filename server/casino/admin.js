// Read-only admin status, disabled unless ADMIN_TOKEN (32+ characters) is set on the server.
// There is no account system yet, so this endpoint never writes: editing providers, credentials or
// games needs real authentication and persistent storage first (docs/casino-integration.md).
import { createHash, timingSafeEqual } from 'node:crypto'

export const MIN_TOKEN_LENGTH = 32
const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 10
const attempts = new Map()

export const adminEnabled = (env = process.env) => typeof env?.ADMIN_TOKEN === 'string' && env.ADMIN_TOKEN.length >= MIN_TOKEN_LENGTH

const digest = (value) => createHash('sha256').update(String(value)).digest()

// 404 when disabled (indistinguishable from a missing route), 401 for a wrong token.
export function authorize(request, env = process.env) {
    if (!adminEnabled(env)) return { ok: false, status: 404 }
    const header = request.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    return timingSafeEqual(digest(token), digest(env.ADMIN_TOKEN)) ? { ok: true } : { ok: false, status: 401 }
}

function throttled(request) {
    const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
    const now = Date.now()
    const entry = attempts.get(ip)
    if (!entry || now - entry.start >= WINDOW_MS) {
        attempts.set(ip, { start: now, count: 1 })
        if (attempts.size > 5000) attempts.delete(attempts.keys().next().value)
        return false
    }
    entry.count += 1
    return entry.count > MAX_ATTEMPTS
}

const json = (body, status) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
})

export function handleAdmin(request, { service, catalog, env = process.env }) {
    if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
    if (throttled(request)) return json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429)
    const auth = authorize(request, env)
    if (!auth.ok) return json({ error: auth.status === 404 ? 'Não encontrado.' : 'Não autorizado.' }, auth.status)
    return json(catalogStatus(service, catalog), 200)
}

// Also served to signed-in staff by the account admin API.
export function catalogStatus(service, catalog) {
    const summary = service.providers()
    return {
        writable: false,
        providers: summary.providers,
        totals: summary.totals,
        sources: summary.sources,
        catalog: {
            generatedAt: catalog.generatedAt,
            imports: catalog.imports,
            rejectedOnLoad: catalog.rejected.length,
            duplicatesOnLoad: catalog.duplicates.length,
        },
    }
}
