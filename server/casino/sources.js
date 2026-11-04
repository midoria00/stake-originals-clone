// Integration sources (aggregators, direct provider integrations, authorized catalog imports).
// Their APIs, endpoints and signing rules are only given to contracted partners, so no request is
// implemented here: each adapter reads its configuration from a server-side environment variable and
// reports "pending" until it is built from the official documentation received with the contract.
// Credentials never leave the server and are never returned by any endpoint.
import { httpsUrl } from './catalog.js'

export class IntegrationError extends Error {
    constructor(code, message) {
        super(message ?? code)
        this.code = code
    }
}

const LIST = [
    { id: 'softswiss', name: 'SOFTSWISS Game Aggregator', kind: 'aggregator' },
    { id: 'hub88', name: 'Hub88', kind: 'aggregator' },
    { id: 'everymatrix', name: 'EveryMatrix CasinoEngine', kind: 'aggregator' },
    { id: 'pg-soft-direct', name: 'PG Soft (direta)', kind: 'direct', providers: ['pg-soft'] },
    { id: 'pragmatic-direct', name: 'Pragmatic Play (direta)', kind: 'direct', providers: ['pragmatic-play'] },
    // Catalog exported by an authorized partner and imported with scripts/casino/importCatalog.mjs.
    { id: 'catalog-import', name: 'Catálogo autorizado importado', kind: 'import' },
    // Slot metadata whose API terms allow caching and redistribution (docs/casino-sources-review.md). No demos.
    { id: 'slot-report', name: 'slot.report (metadados)', kind: 'import' },
]

export const SOURCES = LIST.map((source) => ({ providers: null, ...source, envKey: `CASINO_SOURCE_${source.id.toUpperCase().replace(/-/g, '_')}` }))

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]))
export const getSource = (id) => BY_ID.get(id) ?? null
export const isSourceId = (id) => BY_ID.has(id)

// CASINO_SOURCE_<ID> holds the JSON given by the partner (at least an https "apiUrl").
export function sourceConfig(source, env = process.env) {
    const raw = env?.[source.envKey]
    if (!raw) return null
    try {
        const config = JSON.parse(raw)
        return config && typeof config === 'object' && httpsUrl(config.apiUrl) ? config : null
    } catch {
        return null
    }
}

export function sourceStatus(source, env = process.env) {
    if (source.kind === 'import') return 'manual'
    // Adapters exist only as contracts until the official API documentation is available.
    return sourceConfig(source, env) ? 'pending_implementation' : 'not_configured'
}

// Origins whose official demo pages the owner has confirmed may be embedded (comma-separated https origins).
export function demoOrigins(env = process.env) {
    return new Set(String(env?.CASINO_DEMO_ORIGINS ?? '')
        .split(',')
        .map((value) => httpsUrl(value.trim()))
        .filter(Boolean)
        .map((value) => new URL(value).origin))
}

export function launchDemo(game, env = process.env) {
    if (game.demo?.url) {
        const url = httpsUrl(game.demo.url)
        if (!url) throw new IntegrationError('INVALID_DEMO_URL')
        if (!demoOrigins(env).has(new URL(url).origin)) throw new IntegrationError('DEMO_ORIGIN_NOT_ALLOWED')
        return { kind: 'iframe', url }
    }
    const source = getSource(game.source)
    if (!source || source.kind === 'import' || !sourceConfig(source, env)) throw new IntegrationError('NOT_CONFIGURED')
    throw new IntegrationError('NOT_IMPLEMENTED', `${source.name}: implementar o lançamento de demonstração conforme a documentação oficial do contrato`)
}

// Whether a listed demo can actually be opened with the current configuration.
export function canLaunchDemo(game, env = process.env) {
    try {
        launchDemo(game, env)
        return true
    } catch {
        return false
    }
}
