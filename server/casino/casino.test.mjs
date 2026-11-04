import assert from 'node:assert/strict'
import test from 'node:test'
import { fromSlotReport, mergeCatalog } from '../../scripts/casino/importCatalog.mjs'
import { handleAdmin, MIN_TOKEN_LENGTH } from './admin.js'
import { mapCategory } from './categories.js'
import { buildIndex, dedupeGames, normalizeGame, queryGames, resolveProviderId } from './catalog.js'
import { handle } from './http.js'
import { PROVIDERS } from './providers.js'
import { createCasinoService, loadCatalog } from './service.js'
import { demoOrigins, sourceStatus, SOURCES } from './sources.js'

// Test-only entries: obviously fictitious, never shipped (the real catalog only takes authorized imports).
const FIXTURE = [
    { provider: 'PGSoft', externalId: 'test-1', name: 'Jogo de Teste Ação', category: 'Video Slots', image: 'https://cdn.example.test/1.png', rtp: 96.5, volatility: 'High', platforms: ['Desktop', 'mobile'], languages: ['pt', 'en'], addedAt: '2026-10-01' },
    { provider: 'pragmatic-play', externalId: 'test-2', name: 'Jogo de Teste Mesa', category: 'live casino', demoUrl: 'https://demo.example.test/play?id=2', addedAt: '2026-11-01' },
    { provider: 'Hacksaw', externalId: 'test-3', name: 'Jogo de Teste Raspadinha', category: 'scratch cards', demo: true },
    { provider: 'Desconhecido Ltda', externalId: 'x', name: 'Fora do cadastro' },
    { provider: 'pg-soft', externalId: '', name: 'Sem id' },
    { provider: 'pg-soft', externalId: 'test-1b', name: 'jogo de teste acao' },
]

const fixtureCatalog = () => {
    const games = FIXTURE.map((raw) => normalizeGame(raw, 'catalog-import', new Date('2026-11-04T00:00:00Z')).game).filter(Boolean)
    return { generatedAt: '2026-11-04T00:00:00Z', imports: [], ...dedupeGames(games), rejected: [] }
}

test('registry: 19 unique providers, priority order, no declared integration status', () => {
    assert.equal(PROVIDERS.length, 19)
    assert.equal(new Set(PROVIDERS.map((p) => p.id)).size, 19)
    assert.deepEqual(PROVIDERS.slice(0, 4).map((p) => p.id), ['pg-soft', 'pragmatic-play', 'hacksaw-gaming', 'evolution'])
    for (const provider of PROVIDERS) {
        assert.match(provider.id, /^[a-z0-9-]+$/)
        assert.equal('status' in provider || 'integrated' in provider, false)
    }
})

test('categories and provider names from feeds are normalized', () => {
    assert.equal(mapCategory('Video Slots'), 'slots')
    assert.equal(mapCategory('live_casino'), 'live')
    assert.equal(mapCategory('Scratch Cards'), 'instant')
    assert.equal(mapCategory('algo novo'), 'other')
    assert.equal(resolveProviderId('Pocket Games Soft'), 'pg-soft')
    assert.equal(resolveProviderId('PGSoft'), 'pg-soft')
    assert.equal(resolveProviderId('Evolution Gaming'), 'evolution')
    assert.equal(resolveProviderId('Outra Empresa'), null)
})

test('normalization keeps only documented fields and rejects unknown providers or missing ids', () => {
    const ok = normalizeGame(FIXTURE[0], 'catalog-import').game
    assert.equal(ok.id, 'pg-soft:test-1')
    assert.equal(ok.category, 'slots')
    assert.deepEqual(ok.rtp, { min: 96.5, max: 96.5, verifiedBy: 'catalog-import' })
    assert.equal(ok.volatility, 'high')
    assert.deepEqual(ok.platforms, ['desktop', 'mobile'])
    assert.equal(ok.demo.available, false)
    assert.equal(normalizeGame({ ...FIXTURE[0], image: 'http://insecure.test/x.png' }, 'x').game.image, null)
    assert.equal(normalizeGame({ ...FIXTURE[0], rtp: 140 }, 'x').game.rtp, null)
    assert.match(normalizeGame(FIXTURE[3], 'x').error, /fora do cadastro/)
    assert.match(normalizeGame(FIXTURE[4], 'x').error, /identificador/)
})

test('duplicates by id or by name within a provider are dropped', () => {
    const { games, duplicates } = fixtureCatalog()
    assert.equal(games.length, 3)
    assert.deepEqual(duplicates, ['pg-soft:test-1b'])
})

test('index: accent-insensitive search, provider and category filters, sorting and paging', () => {
    const index = buildIndex(fixtureCatalog().games)
    assert.equal(index.all.length, 9, '6 Originals + 3 fixture games')
    assert.deepEqual(queryGames(index, { q: 'acao' }).items.map((g) => g.id), ['pg-soft:test-1'])
    assert.deepEqual(queryGames(index, { q: 'pocket' }).items.map((g) => g.id), ['pg-soft:test-1'])
    assert.equal(queryGames(index, { provider: '123bet' }).total, 6)
    assert.deepEqual(queryGames(index, { category: 'live' }).items.map((g) => g.id), ['pragmatic-play:test-2'])
    assert.equal(queryGames(index, { sort: 'featured' }).items[0].provider, '123bet')
    assert.equal(queryGames(index, { sort: 'recent' }).items[0].id, '123bet:dice')
    const first = queryGames(index, { limit: 4 })
    const second = queryGames(index, { limit: 4, cursor: first.nextCursor })
    assert.equal(first.items.length, 4)
    assert.equal(second.items.length, 4)
    assert.equal(new Set([...first.items, ...second.items].map((g) => g.id)).size, 8)
    assert.equal(queryGames(index, { limit: 500 }).items.length, 9)
    assert.deepEqual(queryGames(index, { ids: ['123bet:crash', 'nada'] }).items.map((g) => g.id), ['123bet:crash'])
})

test('service with the shipped catalog: 19 registered, 0 integrated, 0 executable', () => {
    const service = createCasinoService({ env: {}, catalog: loadCatalog() })
    const { totals, inHouse, sources } = service.providers()
    assert.deepEqual(totals, { registered: 19, integrated: 0, executable: 0, externalGames: 0, executableGames: 0 })
    assert.equal(inHouse.games, 6)
    assert.ok(sources.every((s) => s.status === 'not_configured' || s.status === 'manual'))
})

test('service: imported games count as integrated; demos need an allowed origin to be executable', () => {
    const catalog = fixtureCatalog()
    const closed = createCasinoService({ env: {}, catalog })
    const pg = closed.providers().providers.find((p) => p.id === 'pg-soft')
    assert.deepEqual(pg.status, { registered: true, integrated: true, executable: false })
    assert.equal(closed.providers().totals.executable, 0)
    assert.deepEqual(closed.launch(new URLSearchParams('game=pragmatic-play:test-2')), { available: false, reason: 'demo_not_authorized' })
    assert.deepEqual(closed.launch(new URLSearchParams('game=hacksaw-gaming:test-3')), { available: false, reason: 'integration_not_configured' })
    assert.deepEqual(closed.launch(new URLSearchParams('game=pg-soft:test-1')), { available: false, reason: 'demo_unavailable' })
    assert.deepEqual(closed.launch(new URLSearchParams('game=123bet:mines')), { available: true, kind: 'internal', path: '/mines' })

    const open = createCasinoService({ env: { CASINO_DEMO_ORIGINS: 'https://demo.example.test' }, catalog })
    assert.deepEqual(open.launch(new URLSearchParams('game=pragmatic-play:test-2')), { available: true, kind: 'iframe', url: 'https://demo.example.test/play?id=2' })
    assert.equal(open.providers().providers.find((p) => p.id === 'pragmatic-play').status.executable, true)
    // The public listing never exposes demo URLs.
    const listed = open.games(new URLSearchParams('provider=pragmatic-play')).items[0]
    assert.equal(listed.demo.url, undefined)
    assert.equal(listed.launchable, true)
})

test('sources: configuration only from server env, https only; adapters stay pending without docs', () => {
    const hub88 = SOURCES.find((s) => s.id === 'hub88')
    assert.equal(sourceStatus(hub88, {}), 'not_configured')
    assert.equal(sourceStatus(hub88, { [hub88.envKey]: '{"apiUrl":"http://x.test"}' }), 'not_configured')
    assert.equal(sourceStatus(hub88, { [hub88.envKey]: '{"apiUrl":"https://api.partner.test"}' }), 'pending_implementation')
    assert.deepEqual([...demoOrigins({ CASINO_DEMO_ORIGINS: 'https://a.test/x, http://b.test, lixo' })], ['https://a.test'])
})

test('http: validation errors, cache headers and no-store launch', async () => {
    const service = createCasinoService({ env: {}, catalog: loadCatalog() })
    const call = (url, kind) => handle(new Request(`http://localhost${url}`), kind, service)
    const providers = await call('/api/casino/providers', 'providers')
    assert.equal(providers.status, 200)
    assert.match(providers.headers.get('cache-control'), /s-maxage=300/)
    assert.equal((await call('/api/casino/games?provider=nao-existe', 'games')).status, 400)
    assert.equal((await call('/api/casino/games?sort=x', 'games')).status, 400)
    assert.equal((await call('/api/casino/games?cursor=-1', 'games')).status, 400)
    const games = await (await call('/api/casino/games?limit=2', 'games')).json()
    assert.equal(games.items.length, 2)
    assert.equal(games.nextCursor, 2)
    const launch = await call('/api/casino/launch?game=nada', 'launch')
    assert.equal(launch.status, 404)
    assert.equal(launch.headers.get('cache-control'), 'no-store')
})

test('admin: hidden without a strong token, 401 with a wrong one, read-only with the right one', async () => {
    const catalog = loadCatalog()
    const service = createCasinoService({ env: {}, catalog })
    const request = (token, ip) => new Request('http://localhost/api/admin/status', { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-real-ip': ip } })
    const strong = 'x'.repeat(MIN_TOKEN_LENGTH)
    assert.equal(handleAdmin(request(null, '1'), { service, catalog, env: {} }).status, 404)
    assert.equal(handleAdmin(request('short', '2'), { service, catalog, env: { ADMIN_TOKEN: 'short' } }).status, 404)
    assert.equal(handleAdmin(request('errado', '3'), { service, catalog, env: { ADMIN_TOKEN: strong } }).status, 401)
    const ok = handleAdmin(request(strong, '4'), { service, catalog, env: { ADMIN_TOKEN: strong } })
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
    assert.equal((await ok.json()).writable, false)
    const post = handleAdmin(new Request('http://localhost/api/admin/status', { method: 'POST' }), { service, catalog, env: { ADMIN_TOKEN: strong } })
    assert.equal(post.status, 405)
})

test('import: needs a known source and an authorization reference; records the import', () => {
    const empty = { games: [], imports: [] }
    assert.throws(() => mergeCatalog(empty, { source: 'qualquer', entries: [], authorization: 'Contrato 1' }), /Fonte desconhecida/)
    assert.throws(() => mergeCatalog(empty, { source: 'hub88', entries: [], authorization: '' }), /authorization/)
    const { catalog, record, rejected } = mergeCatalog(empty, { source: 'hub88', entries: FIXTURE, authorization: 'Contrato de teste', file: 'C:/x/export.json', now: new Date('2026-11-04T00:00:00Z') })
    assert.equal(record.accepted, 4)
    assert.equal(record.rejected, 2)
    assert.equal(record.duplicates, 1)
    assert.equal(record.file, 'export.json')
    assert.equal(rejected.length, 2)
    assert.equal(catalog.games.length, 3)
    assert.ok(catalog.games.every((game) => game.source === 'hub88'))
    const replaced = mergeCatalog(catalog, { source: 'hub88', entries: FIXTURE.slice(0, 1), authorization: 'Contrato de teste', replace: true })
    assert.equal(replaced.catalog.games.length, 1)
    assert.equal(replaced.catalog.imports.length, 2)
})

// Fixture follows the field list documented at https://slot.report/api/ (test-only names).
test('slot.report import keeps the original slug and documented fields, with no images or demos', () => {
    const entries = fromSlotReport({ results: [
        { name: 'Slot de Teste Um', slug: 'slot-de-teste-um', provider: 'Pragmatic Play', provider_slug: 'pragmatic-play', rtp: 96.5, volatility: 'extreme', max_win: 5000, features: ['free-spins', 'multiplier'], release_date: '2021-02-25', image: 'https://img.example.test/a.png' },
        { name: 'Slot de Teste Dois', slug: 'slot-de-teste-dois', provider: 'Outra Empresa', provider_slug: 'outra-empresa', rtp: 96 },
        { name: 'Slot de Teste Um', slug: 'slot-de-teste-um', provider: 'Pragmatic Play', provider_slug: 'pragmatic-play' },
    ] })
    const { catalog, record, rejected } = mergeCatalog({ games: [], imports: [] }, { source: 'slot-report', entries, authorization: 'slot.report API Terms (12/04/2026)' })
    assert.deepEqual([record.accepted, record.rejected, record.duplicates], [2, 1, 1])
    assert.match(rejected[0].error, /fora do cadastro: outra-empresa/)
    const [game] = catalog.games
    assert.equal(game.id, 'pragmatic-play:slot-de-teste-um')
    assert.equal(game.externalId, 'slot-de-teste-um')
    assert.deepEqual(game.rtp, { min: 96.5, max: 96.5, verifiedBy: 'slot-report' })
    assert.equal(game.volatility, 'extreme')
    assert.equal(game.maxWin, 5000)
    assert.deepEqual(game.features, ['free-spins', 'multiplier'])
    assert.equal(game.releasedAt, '2021-02-25')
    assert.equal(game.image, null, 'images are never imported from this source')
    assert.equal(game.demo.available, false)
    assert.equal(game.integrationStatus, 'catalog_only')
    assert.throws(() => fromSlotReport({}), /results/)
    const service = createCasinoService({ env: {}, catalog: loadCatalog(catalog) })
    assert.deepEqual(service.launch(new URLSearchParams('game=pragmatic-play:slot-de-teste-um')), { available: false, reason: 'demo_unavailable' })
})
