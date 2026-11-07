// Picks the data provider (real API-Football with a key, simulated demo otherwise), validates
// query input and decides how long each answer may be cached by the CDN.
import { createApiFootballProvider } from './apiFootball.js'
import { brtDate, createDemoProvider } from './demo.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DAYS = 7
const MAX_IDS = 20
const MATCH_ID = /^(\d{1,10}|d-\d{8}-\d{1,3})$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export class InputError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.status = status
        this.expose = true
    }
}

const sortMatches = (matches) => [...matches].sort((a, b) =>
    a.league.order - b.league.order
    || a.league.name.localeCompare(b.league.name, 'pt-BR')
    || a.kickoff.localeCompare(b.kickoff))

const MAX_AGE_BY_PHASE = { live: 20, scheduled: 60, finished: 3600, cancelled: 3600 }

export function createSportsService({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
    const provider = env.API_FOOTBALL_KEY
        ? createApiFootballProvider({ key: env.API_FOOTBALL_KEY, fetchImpl })
        // The same secret on every instance keeps simulated results consistent between the public
        // sports API and bet settlement; locally (no secret) results follow the public ids as before.
        : createDemoProvider({ now, secret: env.SPORTS_DEMO_SECRET || env.ACCOUNT_HASH_SECRET || null })

    const meta = () => ({
        mode: provider.mode,
        source: provider.source,
        simulated: provider.mode === 'demo',
        updatedAt: new Date(now()).toISOString(),
        quotaRemaining: provider.quota?.().day ?? null,
    })

    return {
        mode: provider.mode,

        async matches(params) {
            const view = params.get('view') ?? 'live'
            // Build `meta` after the provider call so it carries the quota from that response.
            if (view === 'live') {
                const matches = sortMatches(await provider.live())
                return { meta: meta(), view, matches, maxAge: 20 }
            }
            if (view === 'date') {
                const date = params.get('date') ?? ''
                const today = brtDate(now())
                const offset = DATE.test(date) ? Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS) : NaN
                if (!(Math.abs(offset) <= MAX_DAYS)) throw new InputError(`Informe uma data até ${MAX_DAYS} dias antes ou depois de hoje`)
                const matches = sortMatches(await provider.byDate(date, { isToday: offset === 0 }))
                return { meta: meta(), view, date, matches, maxAge: offset === 0 ? 60 : offset < 0 ? 1800 : 600 }
            }
            if (view === 'ids') {
                const ids = [...new Set((params.get('ids') ?? '').split(',').filter(Boolean))]
                if (!ids.length || ids.length > MAX_IDS || !ids.every((id) => MATCH_ID.test(id))) {
                    throw new InputError(`Informe de 1 a ${MAX_IDS} ids de partida válidos`)
                }
                const matches = await provider.byIds(ids)
                return { meta: meta(), view, matches, maxAge: 30 }
            }
            throw new InputError('Visualização inválida')
        },

        async match(params) {
            const id = params.get('id') ?? ''
            if (!MATCH_ID.test(id)) throw new InputError('Id de partida inválido')
            const match = await provider.match(id)
            if (!match) throw new InputError('Partida não encontrada', 404)
            return { meta: meta(), match, maxAge: MAX_AGE_BY_PHASE[match.status.phase] ?? 60 }
        },
    }
}
