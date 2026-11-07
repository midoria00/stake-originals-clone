// Web-standard handler shared by the Vercel Functions in /api/casino and the Vite dev/preview server.
import { createCasinoService } from './service.js'

let defaultService

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
const hits = new Map()

function rateLimited(request) {
    const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
    const now = Date.now()
    const entry = hits.get(ip)
    if (!entry || now - entry.start >= WINDOW_MS) {
        hits.delete(ip)
        hits.set(ip, { start: now, count: 1 })
        if (hits.size > 5000) hits.delete(hits.keys().next().value)
        return false
    }
    entry.count += 1
    return entry.count > MAX_PER_WINDOW
}

const json = (body, status, headers = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex', ...headers },
})

// Catalog data changes only with a deploy or an import, so the CDN can share it for minutes and
// the browser reuses a page for a minute (going back to a list or a game makes no request).
const CACHE = { providers: 300, games: 300 }
const BROWSER_MAX_AGE = 60

export async function handle(request, kind, service = (defaultService ??= createCasinoService())) {
    if (rateLimited(request)) return json({ error: 'Muitas requisições. Aguarde um minuto.' }, 429, { 'Cache-Control': 'no-store', 'Retry-After': '60' })
    const params = new URL(request.url).searchParams
    try {
        const body = kind === 'providers' ? service.providers() : kind === 'games' ? service.games(params) : service.launch(params)
        const maxAge = CACHE[kind]
        return json(body, 200, { 'Cache-Control': maxAge ? `public, max-age=${BROWSER_MAX_AGE}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` : 'no-store' })
    } catch (error) {
        const status = error.status ?? 500
        if (status >= 500) console.error('[casino]', error.message)
        return json({ error: error.expose ? error.message : 'Falha ao consultar o catálogo' }, status, { 'Cache-Control': 'no-store' })
    }
}
