// Web-standard handler shared by the Vercel Functions in /api/sports and the Vite dev/preview server.
import { createSportsService } from './service.js'

let defaultService

function json(body, status, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    })
}

export async function handle(request, kind, service = (defaultService ??= createSportsService())) {
    const params = new URL(request.url).searchParams
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
