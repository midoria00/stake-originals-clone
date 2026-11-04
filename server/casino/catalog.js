// Game catalog: normalization of authorized feeds, de-duplication, in-memory indexes and paging.
// Third-party entries only come from imported catalogs (scripts/casino/importCatalog.mjs); nothing
// here invents games. The six 123bet Originals are always present as in-house games.
import { GAMES } from '../../src/games.js'
import { isCategory, mapCategory } from './categories.js'
import { getProvider, IN_HOUSE_PROVIDER, isProviderId, PROVIDERS } from './providers.js'

export const PAGE_SIZE = 24
export const MAX_PAGE_SIZE = 48
export const SORTS = ['featured', 'az', 'recent']
const PLATFORMS = ['desktop', 'mobile']
const VOLATILITY = ['low', 'medium-low', 'medium', 'medium-high', 'high', 'very-high', 'extreme']

export const fold = (text) => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const text = (value, max = 200) => (typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().replace(/\s+/g, ' ').slice(0, max) || null
    : null)

export function httpsUrl(value) {
    try {
        const url = new URL(value)
        return url.protocol === 'https:' ? url.href : null
    } catch {
        return null
    }
}

const PROVIDER_BY_NAME = new Map(PROVIDERS.flatMap((p) => [p.id, p.name, ...p.aliases].map((name) => [fold(name).replace(/[^a-z0-9]/g, ''), p.id])))

// Feeds name providers in many ways ("PGSoft", "Pocket Games Soft", "pg-soft"); unknown names return null.
export const resolveProviderId = (name) => PROVIDER_BY_NAME.get(fold(name).replace(/[^a-z0-9]/g, '')) ?? null

function rtpRange(raw, source) {
    const values = [raw?.min ?? raw?.value ?? raw, raw?.max ?? raw?.value ?? raw].map(Number)
    if (!values.every((v) => Number.isFinite(v) && v >= 50 && v <= 100)) return null
    const [min, max] = values[0] <= values[1] ? values : [values[1], values[0]]
    return { min, max, verifiedBy: source }
}

// Scraped feeds sometimes list a page link ("Play Demo") as if it were a game.
const PLACEHOLDER_NAME = /^(play\s+)?demo$/i

// Only unambiguous YYYY-MM-DD: Date.parse would read "05.06.2018" as May 6.
function isoDate(value) {
    const day = typeof value === 'string' ? value.slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
    const parsed = new Date(`${day}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(day) ? day : null
}

// Short feature tags; a list holding description fragments (line breaks, long text) is malformed and dropped whole.
function featureList(list) {
    if (!Array.isArray(list)) return []
    if (list.some((f) => typeof f !== 'string' || f.length > 40 || /[\r\n]/.test(f))) return []
    return [...new Set(list.map((f) => f.trim()).filter(Boolean))].slice(0, 20)
}

// One feed entry, already mapped to our field names -> normalized game, or { error }.
export function normalizeGame(raw, source, now = new Date()) {
    if (!raw || typeof raw !== 'object') return { error: 'entrada inválida' }
    const provider = isProviderId(raw.provider) ? raw.provider : resolveProviderId(raw.provider)
    if (!provider || provider === IN_HOUSE_PROVIDER.id) return { error: `provedor fora do cadastro: ${text(raw.provider, 60) ?? '?'}` }
    const externalId = text(raw.externalId, 80)
    const name = text(raw.name, 120)
    if (!externalId || !name) return { error: 'sem nome ou identificador externo' }
    if (PLACEHOLDER_NAME.test(name)) return { error: 'nome de página, não de jogo' }
    const image = httpsUrl(raw.image?.src ?? raw.image)
    // Official demo URL as given by the authorized feed; it is kept server-side and only used by launch.
    const demoUrl = httpsUrl(raw.demo?.url ?? raw.demoUrl)
    const demoUrlAllowed = Boolean(demoUrl) || raw.demo === true || raw.demo?.available === true
    const added = Date.parse(raw.addedAt)
    return {
        game: {
            id: `${provider}:${externalId}`.slice(0, 100),
            name,
            provider,
            category: isCategory(raw.category) ? raw.category : mapCategory(raw.category),
            image: image ? { src: image, avif: httpsUrl(raw.image?.avif), webp: httpsUrl(raw.image?.webp) } : null,
            description: text(raw.description, 600),
            externalId,
            source,
            platforms: Array.isArray(raw.platforms) ? PLATFORMS.filter((p) => raw.platforms.map(fold).includes(p)) : [],
            languages: Array.isArray(raw.languages) ? [...new Set(raw.languages.map((l) => text(l, 12)).filter(Boolean))].slice(0, 40) : [],
            // Only what the feed documents: RTP and volatility are never estimated here.
            rtp: raw.rtp == null ? null : rtpRange(raw.rtp, source),
            volatility: VOLATILITY.includes(fold(raw.volatility).replace(/\s+/g, '-')) ? fold(raw.volatility).replace(/\s+/g, '-') : null,
            features: featureList(raw.features),
            maxWin: Number.isFinite(raw.maxWin) && raw.maxWin > 0 && raw.maxWin <= 10_000_000 ? raw.maxWin : null,
            releasedAt: isoDate(raw.releasedAt),
            availability: raw.available === false ? 'unavailable' : 'available',
            // A demo counts only when the feed marks an official demo; launching still needs a configured source.
            demo: { available: demoUrlAllowed, mode: demoUrlAllowed ? 'official' : null, ...(demoUrl ? { url: demoUrl } : {}) },
            integrationStatus: demoUrlAllowed ? 'demo_listed' : 'catalog_only',
            addedAt: Number.isFinite(added) ? new Date(added).toISOString() : now.toISOString(),
        },
    }
}

// Title variants of one game: "Tut's"/"Tut’s", "Six Six Six"/"SixSixSix", "X Slot by Pragmatic Play".
// Titles with no Latin letters or digits keep their folded form, so they never collapse into one key.
const titleKey = (name) => fold(name).replace(/\s+slot(\s+by\s+.+)?$/, '').replace(/[^a-z0-9]/g, '') || fold(name)

// An official demo first, then the entry with more documented fields.
const rank = (game) => (game.demo.available ? 100 : 0)
    + [game.rtp, game.volatility, game.maxWin, game.releasedAt, game.image, game.description].filter((v) => v != null).length
    + (game.features.length ? 1 : 0)

// Same game from two sources (or listed twice): keep one, preferring an entry with an official demo.
export function dedupeGames(games) {
    const kept = new Map()
    const byName = new Map()
    const duplicates = []
    for (const game of games) {
        const nameKey = `${game.provider}:${titleKey(game.name)}`
        const existing = kept.get(game.id) ?? byName.get(nameKey)
        if (!existing) {
            kept.set(game.id, game)
            byName.set(nameKey, game)
            continue
        }
        if (rank(game) > rank(existing)) {
            kept.delete(existing.id)
            kept.set(game.id, game)
            byName.set(nameKey, game)
            duplicates.push(existing.id)
        } else {
            duplicates.push(game.id)
        }
    }
    return { games: [...kept.values()], duplicates }
}

const IN_HOUSE = {
    crash: { category: 'crash', rtp: { min: 100, max: 100, verifiedBy: 'tests' } },
    plinko: { category: 'plinko', rtp: { min: 98.9, max: 99.2, verifiedBy: 'tests' } },
    mines: { category: 'mines', rtp: { min: 99, max: 99, verifiedBy: 'formula' } },
    dino: { category: 'instant', rtp: { min: null, max: 99, verifiedBy: 'formula' } },
    dice: { category: 'instant', rtp: { min: 98.99, max: 98.99, verifiedBy: 'tests' } },
    limbo: { category: 'instant', rtp: { min: 99, max: 99, verifiedBy: 'tests' } },
}

export const inHouseGames = () => GAMES.map((game) => ({
    id: `${IN_HOUSE_PROVIDER.id}:${game.id}`,
    name: game.navLabel,
    provider: IN_HOUSE_PROVIDER.id,
    category: IN_HOUSE[game.id]?.category ?? 'other',
    image: { src: game.image, avif: game.image.endsWith('.avif') ? game.image : null, webp: null },
    description: null, // the browser shows games.<id>.summary
    externalId: game.id,
    source: IN_HOUSE_PROVIDER.id,
    platforms: ['desktop', 'mobile'],
    languages: ['pt-BR'],
    rtp: IN_HOUSE[game.id]?.rtp ?? null,
    volatility: null,
    features: [],
    maxWin: null,
    releasedAt: null,
    availability: 'available',
    demo: { available: true, mode: 'in-house' },
    integrationStatus: 'in_house',
    addedAt: new Date(`${game.addedAt}T12:00:00Z`).toISOString(),
    internalPath: game.path,
}))

const providerOrder = (game) => getProvider(game.provider)?.order ?? 999
const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR')
const SORTERS = {
    featured: (a, b) => providerOrder(a) - providerOrder(b) || byName(a, b),
    az: byName,
    // Same import moment: newer releases first.
    recent: (a, b) => b.addedAt.localeCompare(a.addedAt) || (b.releasedAt ?? '').localeCompare(a.releasedAt ?? '') || byName(a, b),
}

// Built once per catalog version; queries then only filter pre-sorted lists (per provider when possible).
export function buildIndex(externalGames = []) {
    const all = [...inHouseGames(), ...externalGames]
    const searchKey = new Map(all.map((game) => {
        const provider = getProvider(game.provider)
        return [game.id, fold([game.name, provider?.name, ...(provider?.aliases ?? [])].join(' '))]
    }))
    const sorted = {}
    const byProvider = {}
    for (const sort of SORTS) {
        sorted[sort] = [...all].sort(SORTERS[sort])
        byProvider[sort] = new Map()
        for (const game of sorted[sort]) {
            if (!byProvider[sort].has(game.provider)) byProvider[sort].set(game.provider, [])
            byProvider[sort].get(game.provider).push(game)
        }
    }
    const counts = new Map()
    for (const game of all) {
        const entry = counts.get(game.provider) ?? { games: 0, demos: 0, categories: {} }
        entry.games += 1
        if (game.demo.available && game.availability === 'available') entry.demos += 1
        entry.categories[game.category] = (entry.categories[game.category] ?? 0) + 1
        counts.set(game.provider, entry)
    }
    return { all, byId: new Map(all.map((game) => [game.id, game])), searchKey, sorted, byProvider, counts }
}

export function queryGames(index, { q = '', provider = null, category = null, sort = 'featured', cursor = 0, limit = PAGE_SIZE, ids = null } = {}) {
    if (ids) {
        const items = ids.map((id) => index.byId.get(id)).filter(Boolean)
        return { items, total: items.length, nextCursor: null }
    }
    const mode = SORTS.includes(sort) ? sort : 'featured'
    const base = provider ? index.byProvider[mode].get(provider) ?? [] : index.sorted[mode]
    const terms = fold(q).split(/\s+/).filter(Boolean)
    const matches = (category || terms.length)
        ? base.filter((game) => (!category || game.category === category) && terms.every((term) => index.searchKey.get(game.id).includes(term)))
        : base
    const start = Math.max(0, Math.trunc(cursor) || 0)
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit) || PAGE_SIZE))
    return {
        items: matches.slice(start, start + size),
        total: matches.length,
        nextCursor: start + size < matches.length ? start + size : null,
    }
}
