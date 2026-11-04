// Web-standard handler shared by the Vercel Functions in /api/sports and the Vite dev/preview server.
import { createSportsService } from './service.js'

let defaultService

// Per-instance limit per visitor; a Vercel WAF rate-limit rule on /api/sports is the stronger,
// shared version of this (see README).
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60
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

function json(body, status, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    })
}

export async function handle(request, kind, service = (defaultService ??= createSportsService())) {
    const params = new URL(request.url).searchParams
    if (rateLimited(request)) {
        return json({ error: 'Muitas requisições. Aguarde um minuto.' }, 429, { 'Cache-Control': 'no-store', 'Retry-After': '60' })
    }
    try {
        const { maxAge, ...body } = kind === 'match' ? await service.match(params) : await service.matches(params)
        // Browsers always revalidate; the CDN shares one answer per URL across all visitors.
        return json(body, 200, { 'Cache-Control': `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` })
    } catch (error) {
        const status = error.status ?? 500
        if (status >= 500) console.error('[sports]', error.message)
        return json(
            { error: error.expose ? error.message : 'Falha ao obter dados esportivos' },
            status,
            { 'Cache-Control': 'no-store', ...(error.quota ? { 'Retry-After': '60' } : {}) },
        )
    }
}
