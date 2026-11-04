// Casino catalog service: provider statuses, paged game queries and demo launch decisions.
// Statuses are derived, never declared:
//   registered  = listed in providers.js
//   integrated  = has games imported from an authorized catalog
//   executable  = has at least one demo that can be opened with the current server configuration
import catalogFile from './data/catalog.json' with { type: 'json' }
import { isCategory } from './categories.js'
import { buildIndex, dedupeGames, normalizeGame, queryGames, SORTS } from './catalog.js'
import { IN_HOUSE_PROVIDER, isProviderId, PROVIDERS } from './providers.js'
import { canLaunchDemo, IntegrationError, isSourceId, launchDemo, SOURCES, sourceStatus } from './sources.js'

export class InputError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.status = status
        this.expose = true
    }
}

// Re-validates the stored catalog so a hand-edited file cannot inject unexpected fields.
export function loadCatalog(file = catalogFile) {
    const games = []
    const rejected = []
    for (const raw of Array.isArray(file?.games) ? file.games : []) {
        const source = isSourceId(raw?.source) ? raw.source : 'catalog-import'
        const { game, error } = normalizeGame(raw, source)
        if (game) games.push(game)
        else rejected.push(error)
    }
    const { games: unique, duplicates } = dedupeGames(games)
    return { generatedAt: file?.generatedAt ?? null, imports: Array.isArray(file?.imports) ? file.imports : [], games: unique, rejected, duplicates }
}

// The browser never sees official demo URLs or source configuration.
const publicGame = ({ demo, internalPath, ...game }) => ({
    ...game,
    ...(internalPath ? { internalPath } : {}),
    demo: { available: demo.available, mode: demo.mode },
})

function parseIds(value) {
    if (!value) return null
    const ids = [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))]
    if (ids.length > 48 || ids.some((id) => id.length > 100)) throw new InputError('Lista de jogos inválida.')
    return ids
}

export function createCasinoService({ env = process.env, catalog = loadCatalog() } = {}) {
    const index = buildIndex(catalog.games)
    const isInHouse = (game) => game.provider === IN_HOUSE_PROVIDER.id
    const launchable = (game) => isInHouse(game) || (game.demo.available && game.availability === 'available' && canLaunchDemo(game, env))

    function providers() {
        const rows = PROVIDERS.map((provider) => {
            const games = index.byProvider.featured.get(provider.id) ?? []
            const executableGames = games.filter(launchable).length
            return {
                id: provider.id,
                name: provider.name,
                aliases: provider.aliases,
                order: provider.order,
                website: provider.website,
                group: provider.group,
                games: games.length,
                demosListed: games.filter((game) => game.demo.available).length,
                executableGames,
                categories: index.counts.get(provider.id)?.categories ?? {},
                status: { registered: true, integrated: games.length > 0, executable: executableGames > 0 },
            }
        })
        return {
            providers: rows,
            inHouse: { id: IN_HOUSE_PROVIDER.id, name: IN_HOUSE_PROVIDER.name, games: index.counts.get(IN_HOUSE_PROVIDER.id)?.games ?? 0 },
            totals: {
                registered: rows.length,
                integrated: rows.filter((row) => row.status.integrated).length,
                executable: rows.filter((row) => row.status.executable).length,
                externalGames: rows.reduce((total, row) => total + row.games, 0),
                executableGames: rows.reduce((total, row) => total + row.executableGames, 0),
            },
            sources: SOURCES.map((source) => ({ id: source.id, name: source.name, kind: source.kind, status: sourceStatus(source, env) })),
            catalog: { generatedAt: catalog.generatedAt, imports: catalog.imports.length },
        }
    }

    function games(params) {
        const provider = params.get('provider') || null
        const category = params.get('category') || null
        const sort = params.get('sort') || 'featured'
        const cursor = Number(params.get('cursor') ?? 0)
        const limit = Number(params.get('limit') ?? 24)
        if (provider && !isProviderId(provider)) throw new InputError('Provedor inválido.')
        if (category && !isCategory(category)) throw new InputError('Categoria inválida.')
        if (!SORTS.includes(sort)) throw new InputError('Ordenação inválida.')
        if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1) throw new InputError('Paginação inválida.')
        const result = queryGames(index, { q: (params.get('q') ?? '').slice(0, 60), provider, category, sort, cursor, limit, ids: parseIds(params.get('ids')) })
        return { ...result, items: result.items.map((game) => ({ ...publicGame(game), launchable: launchable(game) })) }
    }

    function launch(params) {
        const game = index.byId.get(params.get('game') ?? '')
        if (!game) throw new InputError('Jogo não encontrado.', 404)
        if (isInHouse(game)) return { available: true, kind: 'internal', path: game.internalPath }
        if (game.availability !== 'available') return { available: false, reason: 'game_unavailable' }
        if (!game.demo.available) return { available: false, reason: 'demo_unavailable' }
        try {
            return { available: true, ...launchDemo(game, env) }
        } catch (error) {
            if (!(error instanceof IntegrationError)) throw error
            const reason = { NOT_CONFIGURED: 'integration_not_configured', NOT_IMPLEMENTED: 'integration_pending' }[error.code] ?? 'demo_not_authorized'
            return { available: false, reason }
        }
    }

    return { providers, games, launch, index }
}
