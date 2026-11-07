import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { applyImages, coverage, fetchImage, isPublicAddress, matchImages, safeLookup, verifyImages } from '../../scripts/casino/importImages.mjs'
import catalogFile from './data/catalog.json' with { type: 'json' }
import { normalizeGame } from './catalog.js'
import { checkImageFile, imageHosts, imageSourceList, imageUrl, isPublicHostname, MAX_IMAGE_BYTES, normalizeImage, sniffImage } from './images.js'
import { createCasinoService, loadCatalog } from './service.js'

// Test-only hosts and games: obviously fictitious, never shipped.
const HOSTS = new Set(['covers.fornecedor-teste.com'])
const COVER = 'https://covers.fornecedor-teste.com'
const SOURCE = { id: 'pacote-teste', name: 'Pacote de teste', hosts: [...HOSTS], authorization: 'Autorização de teste nº 1 (fictícia)' }

const games = [
    { id: 'pragmatic-play:portao-dourado', provider: 'pragmatic-play', externalId: 'portao-dourado', name: 'Portão Dourado', image: null },
    { id: 'pragmatic-play:portao-dourado-1000', provider: 'pragmatic-play', externalId: 'portao-dourado-1000', name: 'Portão Dourado 1000', image: null },
    { id: 'pragmatic-play:doce-bonanca', provider: 'pragmatic-play', externalId: 'doce-bonanca', name: 'Doce Bonança', image: null },
    { id: 'pragmatic-play:doce-bonanca-x', provider: 'pragmatic-play', externalId: 'doce-bonanca-x', name: 'Doce Bonanca', image: null },
    { id: 'pg-soft:tigre-teste', provider: 'pg-soft', externalId: 'tigre-teste', name: 'Tigre de Teste', image: null },
    { id: 'bgaming:tigre-teste', provider: 'bgaming', externalId: 'tigre-teste', name: 'Tigre de Teste', image: null },
]

const png = (width, height) => {
    const b = Buffer.alloc(33)
    b.writeUInt32BE(0x89504e47, 0)
    b.writeUInt32BE(0x0d0a1a0a, 4)
    b.writeUInt32BE(13, 8)
    b.write('IHDR', 12, 'latin1')
    b.writeUInt32BE(width, 16)
    b.writeUInt32BE(height, 20)
    return b
}

const jpeg = (width, height) => Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'latin1'), Buffer.alloc(9),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03]), Buffer.alloc(9),
])

const webp = (chunk, payload) => {
    const body = Buffer.concat([Buffer.from(chunk, 'latin1'), Buffer.alloc(4), payload])
    const b = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), body, Buffer.alloc(Math.max(0, 30 - 12 - body.length))])
    b.writeUInt32LE(b.length - 8, 4)
    return b
}
const webpX = (width, height) => {
    const p = Buffer.alloc(10)
    p.writeUIntLE(width - 1, 4, 3)
    p.writeUIntLE(height - 1, 7, 3)
    return webp('VP8X', p)
}
const webpLossy = (width, height) => {
    const p = Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 0, 0])
    p.writeUInt16LE(width, 6)
    p.writeUInt16LE(height, 8)
    return webp('VP8 ', p)
}
const webpLossless = (width, height) => {
    const p = Buffer.alloc(5)
    p[0] = 0x2f
    p.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1)
    return webp('VP8L', p)
}

const box = (type, ...parts) => {
    const body = Buffer.concat(parts)
    const head = Buffer.alloc(8)
    head.writeUInt32BE(8 + body.length, 0)
    head.write(type, 4, 'latin1')
    return Buffer.concat([head, body])
}
const avif = (width, height) => {
    const size = Buffer.alloc(12)
    size.writeUInt32BE(width, 4)
    size.writeUInt32BE(height, 8)
    return Buffer.concat([
        box('ftyp', Buffer.from('avif', 'latin1'), Buffer.alloc(4), Buffer.from('avifmif1', 'latin1')),
        box('meta', Buffer.alloc(4), box('iprp', box('ipco', box('ispe', size)))),
    ])
}

const respond = (statusCode, headers = {}, body = null) => Object.assign(Readable.from(body ? [body] : []), { statusCode, headers })

test('image URLs: https on an authorized public host only', () => {
    assert.equal(imageUrl(`${COVER}/a b.webp`, HOSTS), `${COVER}/a%20b.webp`)
    assert.equal(imageUrl(`${COVER}/w_320,h_400/a.webp`, HOSTS), `${COVER}/w_320,h_400/a.webp`)
    for (const bad of [
        'http://covers.fornecedor-teste.com/a.png',
        'https://user:senha@covers.fornecedor-teste.com/a.png',
        'https://covers.fornecedor-teste.com:8443/a.png',
        'https://outro-host.com/a.png',
        'javascript:alert(1)',
        'data:image/png;base64,AAAA',
        '//covers.fornecedor-teste.com/a.png',
        `${COVER}/${'a'.repeat(1100)}.png`,
        null,
    ]) assert.equal(imageUrl(bad, HOSTS), null, String(bad).slice(0, 60))
    assert.equal(imageUrl(`${COVER}/a.png`, new Set()), null, 'no recorded authorization, no image')
    for (const host of ['127.0.0.1', 'localhost', '[::1]', '10.0.0.8', 'intranet', 'cdn.internal', 'covers.test', 'a.local', '169.254.169.254']) {
        assert.equal(imageUrl(`https://${host}/a.png`, new Set([host.replace(/[[\]]/g, '')])), null, host)
        assert.equal(isPublicHostname(host.replace(/[[\]]/g, '')), false, host)
    }
    assert.equal(isPublicHostname('covers.fornecedor-teste.com'), true)
})

test('stored covers keep sizes only when both are sane, and variants only on authorized hosts', () => {
    assert.deepEqual(normalizeImage({ src: `${COVER}/a.png`, avif: `${COVER}/a.avif`, webp: 'https://outro-host.com/a.webp', width: 320, height: 400, sourceId: 'pacote-teste', credit: ' © Estúdio Teste ' }, HOSTS), {
        src: `${COVER}/a.png`, avif: `${COVER}/a.avif`, webp: null, width: 320, height: 400, sourceId: 'pacote-teste', credit: '© Estúdio Teste',
    })
    assert.deepEqual(normalizeImage({ src: `${COVER}/a.png`, width: 320, height: 99999 }, HOSTS), { src: `${COVER}/a.png`, avif: null, webp: null })
    assert.equal(normalizeImage(`${COVER}/a.png`, HOSTS).src, `${COVER}/a.png`)
    assert.equal(normalizeImage({ src: 'https://outro-host.com/a.png' }, HOSTS), null)
})

test('image authorizations need an id, a written reference and public hosts', () => {
    const file = { imageSources: [SOURCE, { id: 'curto', authorization: 'ok', hosts: ['a.example.com'] }, { id: 'sem-host', authorization: 'Autorização longa o bastante', hosts: ['localhost'] }, { id: 'Inválido!', authorization: 'Autorização longa o bastante', hosts: ['b.example.com'] }] }
    assert.deepEqual(imageSourceList(file).map((s) => s.id), ['pacote-teste'])
    assert.deepEqual([...imageHosts(file)], ['covers.fornecedor-teste.com'])
    assert.equal(imageHosts({}).size, 0)
})

test('the catalog loader drops covers without a recorded authorization', () => {
    const raw = { provider: 'pg-soft', externalId: 'x1', name: 'Jogo X', image: { src: `${COVER}/x1.webp`, width: 320, height: 400 } }
    assert.equal(loadCatalog({ games: [raw] }).games[0].image, null)
    assert.equal(loadCatalog({ games: [{ ...raw, image: 'https://outro-host.com/x1.webp' }], imageSources: [SOURCE] }).games[0].image, null)
    const kept = loadCatalog({ games: [raw], imageSources: [SOURCE] })
    assert.deepEqual(kept.games[0].image, { src: `${COVER}/x1.webp`, avif: null, webp: null, width: 320, height: 400 })
    assert.deepEqual(kept.imageSources.map((s) => s.id), ['pacote-teste'])
    assert.equal(normalizeGame(raw, 'catalog-import').game.image, null, 'normalization denies images by default')
})

test('file checks read the real format and size from the bytes', () => {
    assert.deepEqual(sniffImage(png(320, 400)), { type: 'image/png', width: 320, height: 400 })
    assert.deepEqual(sniffImage(jpeg(640, 800)), { type: 'image/jpeg', width: 640, height: 800 })
    assert.deepEqual(sniffImage(webpX(300, 375)), { type: 'image/webp', width: 300, height: 375 })
    assert.deepEqual(sniffImage(webpLossy(320, 400)), { type: 'image/webp', width: 320, height: 400 })
    assert.deepEqual(sniffImage(webpLossless(256, 320)), { type: 'image/webp', width: 256, height: 320 })
    assert.deepEqual(sniffImage(avif(480, 600)), { type: 'image/avif', width: 480, height: 600 })
    assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
    assert.equal(sniffImage(Buffer.from('<html><script>alert(1)</script></html>')), null)
    assert.equal(sniffImage(Buffer.alloc(0)), null)

    const ok = checkImageFile(png(320, 400), 'image/png; charset=binary')
    assert.equal(ok.type, 'image/png')
    assert.match(ok.sha256, /^[0-9a-f]{64}$/)
    assert.match(checkImageFile(png(320, 400), 'image/jpeg').error, /declarado como image\/jpeg/)
    assert.match(checkImageFile(png(320, 400), 'image/svg+xml').error, /tipo não aceito/)
    assert.match(checkImageFile(png(32, 40), 'image/png').error, /fora dos limites/)
    assert.match(checkImageFile(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png').error, /grande demais/)
})

test('matching: exact id or a unique title per provider, never a near name', () => {
    const { matches, rejected } = matchImages(games, [
        { provider: 'Pragmatic Play', externalId: 'portao-dourado', src: `${COVER}/1.webp` },
        { provider: 'pragmatic-play', name: 'Portão Dourado 1000 Slot by Pragmatic Play', src: `${COVER}/2.webp` },
        { provider: 'pragmatic-play', name: 'Doce Bonança', src: `${COVER}/3.webp` },
        { provider: 'pragmatic-play', name: 'Portão Dourado Megaways', src: `${COVER}/4.webp` },
        { provider: 'PGSoft', externalId: 'tigre-teste', name: 'Tigre do Teste', src: `${COVER}/5.webp` },
        { provider: 'Outra Empresa', name: 'Tigre de Teste', src: `${COVER}/6.webp` },
        { provider: '123bet', externalId: 'crash', src: `${COVER}/7.webp` },
        { provider: 'bgaming', name: 'Tigre de Teste', src: 'https://outro-host.com/8.webp' },
        null,
    ], { hosts: HOSTS })
    assert.deepEqual(matches.map((m) => [m.game.id, m.via, m.image.src]), [
        ['pragmatic-play:portao-dourado', 'externalId', `${COVER}/1.webp`],
        ['pragmatic-play:portao-dourado-1000', 'name', `${COVER}/2.webp`],
    ])
    const reasons = Object.fromEntries(rejected.map((r) => [r.index, r.reason]))
    assert.match(reasons[2], /nome ambíguo: pragmatic-play:doce-bonanca, pragmatic-play:doce-bonanca-x/)
    assert.equal(reasons[3], 'nenhum jogo correspondente')
    assert.match(reasons[4], /não confere com o id \(Tigre de Teste\)/)
    assert.equal(reasons[5], 'provedor fora do catálogo')
    assert.equal(reasons[6], 'provedor fora do catálogo', 'Originals are never touched')
    assert.match(reasons[7], /fora dos hosts autorizados/)
    assert.equal(reasons[8], 'entrada inválida')
})

test('matching: one image per game and one game per image', () => {
    const { matches, rejected } = matchImages(games, [
        { provider: 'pg-soft', externalId: 'tigre-teste', src: `${COVER}/igual.webp` },
        { provider: 'bgaming', externalId: 'tigre-teste', src: `${COVER}/igual.webp` },
        { provider: 'pragmatic-play', name: 'Portão Dourado', src: `${COVER}/por-nome.webp` },
        { provider: 'pragmatic-play', externalId: 'portao-dourado', src: `${COVER}/por-id.webp` },
        { provider: 'pragmatic-play', externalId: 'portao-dourado-1000', src: `${COVER}/a.webp` },
        { provider: 'pragmatic-play', externalId: 'portao-dourado-1000', src: `${COVER}/a.webp` },
        { provider: 'pragmatic-play', name: 'Doce Bonança', externalId: 'doce-bonanca', src: `${COVER}/b1.webp` },
        { provider: 'pragmatic-play', externalId: 'doce-bonanca', src: `${COVER}/b2.webp` },
    ], { hosts: HOSTS })
    assert.deepEqual(matches.map((m) => [m.game.id, m.image.src]), [
        ['pragmatic-play:portao-dourado', `${COVER}/por-id.webp`],
        ['pragmatic-play:portao-dourado-1000', `${COVER}/a.webp`],
    ])
    const reasons = Object.fromEntries(rejected.map((r) => [r.index, r.reason]))
    assert.match(reasons[0], /mesma imagem foi indicada para 2 jogos/)
    assert.match(reasons[1], /mesma imagem foi indicada para 2 jogos/)
    assert.equal(reasons[2], 'imagem diferente da indicada pelo id do jogo')
    assert.equal(reasons[6], 'imagens diferentes para o mesmo jogo')
    assert.equal(reasons[7], 'imagens diferentes para o mesmo jogo')
})

test('fetching: authorized hosts only, redirects checked, type and weight enforced', async () => {
    const files = {
        [`${COVER}/ok.png`]: () => respond(200, { 'content-type': 'image/png' }, png(320, 400)),
        [`${COVER}/move`]: () => respond(302, { location: '/ok.png' }),
        [`${COVER}/fora`]: () => respond(301, { location: 'https://outro-host.com/x.png' }),
        [`${COVER}/interno`]: () => respond(307, { location: 'https://169.254.169.254/latest/meta-data' }),
        [`${COVER}/loop`]: () => respond(302, { location: `${COVER}/loop` }),
        [`${COVER}/sumiu.png`]: () => respond(404),
        [`${COVER}/html.png`]: () => respond(200, { 'content-type': 'text/html' }, Buffer.from('<script>alert(1)</script>')),
        [`${COVER}/disfarce.png`]: () => respond(200, { 'content-type': 'image/png' }, Buffer.from('<svg onload="alert(1)"/>')),
        [`${COVER}/grande.png`]: () => respond(200, { 'content-type': 'image/png', 'content-length': String(MAX_IMAGE_BYTES + 1) }, png(320, 400)),
        [`${COVER}/grande-sem-tamanho.png`]: () => respond(200, { 'content-type': 'image/png' }, Buffer.concat([png(320, 400), Buffer.alloc(MAX_IMAGE_BYTES)])),
    }
    const requested = []
    const get = async (url) => {
        requested.push(url)
        if (!files[url]) throw Object.assign(new Error('não deveria ser chamado'), { code: 'EUNEXPECTED' })
        return files[url]()
    }
    const fetch = (src) => fetchImage(src, { hosts: HOSTS, get })
    const ok = await fetch(`${COVER}/move`)
    assert.equal(ok.error, undefined)
    assert.deepEqual([ok.type, ok.width, ok.height, ok.url], ['image/png', 320, 400, `${COVER}/ok.png`])
    assert.match((await fetch(`${COVER}/fora`)).error, /fora dos hosts autorizados/)
    assert.match((await fetch(`${COVER}/interno`)).error, /fora dos hosts autorizados/)
    assert.match((await fetch(`${COVER}/loop`)).error, /redirecionamentos demais/)
    assert.equal((await fetch(`${COVER}/sumiu.png`)).error, 'HTTP 404')
    assert.match((await fetch(`${COVER}/html.png`)).error, /tipo não aceito: text\/html/)
    assert.match((await fetch(`${COVER}/disfarce.png`)).error, /não é uma imagem válida/)
    assert.match((await fetch(`${COVER}/grande.png`)).error, /grande demais/)
    assert.match((await fetch(`${COVER}/grande-sem-tamanho.png`)).error, /grande demais/)
    assert.match((await fetch('https://outro-host.com/x.png')).error, /fora da política/)
    assert.match((await fetch('http://covers.fornecedor-teste.com/ok.png')).error, /fora da política/)
    assert.ok(!requested.some((url) => !url.startsWith(`${COVER}/`)), 'nothing outside the authorized host was requested')
    const timeout = await fetchImage(`${COVER}/lento.png`, { hosts: HOSTS, get: async () => { throw Object.assign(new Error('tempo esgotado'), { code: 'ETIMEDOUT' }) } })
    assert.equal(timeout.error, 'falha de rede: ETIMEDOUT')
})

test('connections only open to public addresses', async () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '224.0.0.1', 'nada']) {
        assert.equal(isPublicAddress(address), false, address)
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address)
    const fakeDns = (answers) => (hostname, options, callback) => callback(null, answers[hostname])
    const lookup = safeLookup(fakeDns({ 'publico.com': [{ address: '8.8.8.8', family: 4 }], 'rebind.com': [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], 'vazio.com': [] }))
    const run = (host, options) => new Promise((resolve) => lookup(host, options, (error, ...rest) => resolve({ error, rest })))
    assert.deepEqual((await run('publico.com', {})).rest, ['8.8.8.8', 4])
    assert.deepEqual((await run('publico.com', { all: true })).rest, [[{ address: '8.8.8.8', family: 4 }]])
    assert.equal((await run('rebind.com', {})).error.code, 'EADDRNOTPUBLIC')
    assert.equal((await run('vazio.com', 4)).error.code, 'EADDRNOTPUBLIC')
})

test('verification downloads each URL once and drops failures and identical files', async () => {
    const { matches } = matchImages(games, [
        { provider: 'pragmatic-play', externalId: 'portao-dourado', src: `${COVER}/1.png`, avif: `${COVER}/1.avif`, webp: `${COVER}/1-falso.webp` },
        { provider: 'pragmatic-play', externalId: 'portao-dourado-1000', src: `${COVER}/em-breve-a.png` },
        { provider: 'pg-soft', externalId: 'tigre-teste', src: `${COVER}/em-breve-b.png` },
        { provider: 'bgaming', externalId: 'tigre-teste', src: `${COVER}/quebrada.png` },
    ], { hosts: HOSTS })
    const placeholder = { type: 'image/png', width: 320, height: 400, sha256: 'b'.repeat(64) }
    const answers = {
        [`${COVER}/1.png`]: { type: 'image/png', width: 640, height: 800, sha256: 'a'.repeat(64) },
        [`${COVER}/1.avif`]: { type: 'image/avif', width: 640, height: 800, sha256: 'c'.repeat(64) },
        [`${COVER}/1-falso.webp`]: { type: 'image/png', width: 640, height: 800, sha256: 'd'.repeat(64) },
        [`${COVER}/em-breve-a.png`]: placeholder,
        [`${COVER}/em-breve-b.png`]: placeholder,
        [`${COVER}/quebrada.png`]: { error: 'HTTP 404' },
    }
    const calls = []
    const fetch = async (src) => {
        calls.push(src)
        return answers[src]
    }
    const cache = new Map()
    const first = await verifyImages(matches, { fetch, cache })
    assert.deepEqual(first.matches.map((m) => [m.game.id, m.image.width, m.image.height, m.image.avif, m.image.webp]), [['pragmatic-play:portao-dourado', 640, 800, `${COVER}/1.avif`, null]])
    assert.deepEqual(first.rejected.map((r) => [r.gameId, r.reason]).sort(), [
        ['bgaming:tigre-teste', 'falha na verificação: HTTP 404'],
        ['pg-soft:tigre-teste', 'arquivo idêntico ao de outro jogo'],
        ['pragmatic-play:portao-dourado-1000', 'arquivo idêntico ao de outro jogo'],
    ])
    assert.equal(calls.length, 6)
    await verifyImages(matches, { fetch, cache })
    assert.equal(calls.length, 7, 'cached URLs are not downloaded again; the failed one is retried')
})

test('applying covers records the authorization and survives the catalog loader', () => {
    const catalog = { version: 1, generatedAt: null, imports: [{ source: 'slot-report' }], games: games.map((game) => ({ ...game, source: 'slot-report' })) }
    const { matches } = matchImages(catalog.games, [{ provider: 'pg-soft', externalId: 'tigre-teste', src: `${COVER}/tigre.webp`, width: 320, height: 400, credit: 'Estúdio Teste' }], { hosts: HOSTS })
    const now = new Date('2026-11-05T12:00:00Z')
    const next = applyImages(catalog, matches, { source: SOURCE, now })
    assert.deepEqual(Object.keys(next), ['version', 'generatedAt', 'imports', 'imageSources', 'games'])
    assert.deepEqual(next.imports, catalog.imports)
    assert.equal(next.imageSources[0].covers, 1)
    assert.equal(next.imageSources[0].recordedAt, now.toISOString())
    const loaded = loadCatalog(next)
    const tiger = loaded.games.find((game) => game.id === 'pg-soft:tigre-teste')
    assert.deepEqual(tiger.image, { src: `${COVER}/tigre.webp`, avif: null, webp: null, width: 320, height: 400, sourceId: 'pacote-teste', credit: 'Estúdio Teste' })
    assert.ok(loaded.games.filter((game) => game.id !== tiger.id).every((game) => game.image === null))
    const service = createCasinoService({ env: {}, catalog: loaded })
    assert.equal(service.games(new URLSearchParams('ids=pg-soft:tigre-teste')).items[0].image.src, `${COVER}/tigre.webp`)
    assert.deepEqual(coverage(loaded.games).providers.find((row) => row.provider === 'pg-soft'), { provider: 'pg-soft', games: 1, withImage: 1 })

    const cleared = applyImages(next, [], { source: SOURCE, replace: true, now })
    assert.ok(cleared.games.every((game) => game.image === null))
    assert.equal(cleared.imageSources[0].recordedAt, now.toISOString())
})

test('shipped catalog: every cover has a recorded authorization; Originals keep their own art', () => {
    const catalog = loadCatalog()
    const sources = new Set(catalog.imageSources.map((source) => source.id))
    assert.ok(catalog.games.every((game) => game.image === null || sources.has(game.image.sourceId)))
    assert.equal(catalog.games.filter((game) => game.image).length, (catalogFile.games ?? []).filter((game) => game.image).length, 'the loader dropped no stored cover')
    const service = createCasinoService({ env: {}, catalog })
    const originals = service.games(new URLSearchParams('provider=123bet&limit=48')).items
    assert.deepEqual(originals.map((game) => game.image.src).sort(), ['/images/crash.avif', '/images/dice.svg', '/images/dino.avif', '/images/limbo.svg', '/images/mines.avif', '/images/plinko.avif'])
})
