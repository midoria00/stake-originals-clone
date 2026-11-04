import assert from 'node:assert/strict'
import test from 'node:test'
import { CATEGORIES } from './categories.js'
import { buildIndex, normalizeGame, queryGames } from './catalog.js'
import { PROVIDERS } from './providers.js'
import { createCasinoService } from './service.js'

// Synthetic, test-only catalog: checks the index stays fast and correct with thousands of games.
const SIZE = 10_000
const games = Array.from({ length: SIZE }, (_, i) => normalizeGame({
    provider: PROVIDERS[i % PROVIDERS.length].id,
    externalId: `g${i}`,
    name: `Jogo Sintético ${i}`,
    category: CATEGORIES[i % CATEGORIES.length],
    addedAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
}, 'catalog-import').game)

test(`index of ${SIZE} games builds quickly and pages through every game exactly once`, () => {
    const started = performance.now()
    const index = buildIndex(games)
    const buildMs = performance.now() - started
    assert.ok(buildMs < 3000, `build took ${buildMs.toFixed(0)} ms`)
    assert.equal(index.all.length, SIZE + 6)

    const seen = new Set()
    for (let cursor = 0; cursor !== null;) {
        const page = queryGames(index, { cursor, limit: 48 })
        page.items.forEach((game) => seen.add(game.id))
        cursor = page.nextCursor
    }
    assert.equal(seen.size, SIZE + 6)
})

test('search, provider and category filters stay fast on the large index', () => {
    const index = buildIndex(games)
    const started = performance.now()
    let result
    for (let i = 0; i < 200; i += 1) result = queryGames(index, { q: 'sintetico 99', provider: 'pg-soft', category: 'slots', sort: 'az' })
    const perQuery = (performance.now() - started) / 200
    assert.ok(perQuery < 25, `query took ${perQuery.toFixed(2)} ms`)
    assert.ok(result.items.every((game) => game.provider === 'pg-soft' && game.category === 'slots' && game.name.includes('99')))
    const newest = PROVIDERS[(SIZE - 1) % PROVIDERS.length].id
    assert.equal(queryGames(index, { provider: newest, sort: 'recent', limit: 1 }).items[0].id, `${newest}:g${SIZE - 1}`)
})

test('provider statuses on the large catalog: integrated, but no demo is executable', () => {
    const service = createCasinoService({ env: {}, catalog: { games, imports: [], generatedAt: null } })
    const { totals } = service.providers()
    assert.equal(totals.externalGames, SIZE)
    assert.equal(totals.integrated, PROVIDERS.length)
    assert.equal(totals.executable, 0)
})
