#!/usr/bin/env node
// Adds cover images to catalog games from a source whose use is authorized (provider asset pack,
// licensed API or written permission). Precision first: an image is applied only when it matches
// exactly one game, by provider + externalId or by a title that is unique within the provider.
// Ambiguous, conflicting and duplicated images are rejected and listed; nothing is guessed.
// Dry run by default; --write requires --verify, so every stored cover was downloaded and checked.
//
//   node scripts/casino/importImages.mjs --manifest covers.json --source <id> --hosts cdn.example.com[,...] \
//       --authorization "<written reference>" [--name "<source name>"] [--terms-url <url>] \
//       [--verify] [--refresh] [--write] [--replace] [--report report.json]
//
// Manifest: a JSON array (or { "images": [...] }) of
//   { provider, externalId?, name?, src, avif?, webp?, width?, height?, credit? }
// --verify fetches each URL once (results cached by URL in .cache/catalog-images/index.json) and
// checks type, bytes, pixel size and identical files across games (content hash). Only https URLs
// on --hosts are fetched, redirects must stay on those hosts, and connections to private or
// reserved addresses are refused when the socket opens.
import dns from 'node:dns'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fold, resolveProviderId, titleKey } from '../../server/casino/catalog.js'
import { checkImageFile, imageUrl, isPublicHostname, MAX_IMAGE_BYTES, normalizeImage } from '../../server/casino/images.js'
import { IN_HOUSE_PROVIDER, isProviderId, PROVIDERS } from '../../server/casino/providers.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const CATALOG_PATH = path.join(ROOT, 'server/casino/data/catalog.json')
const CACHE_PATH = path.join(ROOT, '.cache/catalog-images/index.json')

export function parseArgs(argv) {
    const flags = new Set(['--verify', '--refresh', '--write', '--replace'])
    const args = {}
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i]
        if (flags.has(key)) args[key.slice(2)] = true
        else if (key.startsWith('--')) args[key.slice(2)] = argv[(i += 1)]
    }
    return args
}

const gameKey = (provider, value) => `${provider}:${value}`

// Manifest entries -> one image per game and one game per image, or a listed reason.
export function matchImages(games, entries, { hosts }) {
    const byExternal = new Map()
    const byTitle = new Map()
    for (const game of games) {
        byExternal.set(gameKey(game.provider, fold(game.externalId)), game)
        const key = gameKey(game.provider, titleKey(game.name))
        byTitle.set(key, [...(byTitle.get(key) ?? []), game])
    }
    const rejected = []
    const reject = (index, entry, reason) => rejected.push({
        index,
        provider: entry?.provider ?? null,
        externalId: entry?.externalId ?? null,
        name: entry?.name ?? null,
        reason,
    })
    const candidates = []
    for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
        if (!entry || typeof entry !== 'object') {
            reject(index, entry, 'entrada inválida')
            continue
        }
        const provider = isProviderId(entry.provider) ? entry.provider : resolveProviderId(entry.provider)
        if (!provider || provider === IN_HOUSE_PROVIDER.id) {
            reject(index, entry, 'provedor fora do catálogo')
            continue
        }
        const image = normalizeImage(entry, hosts)
        if (!image) {
            reject(index, entry, 'URL inválida ou fora dos hosts autorizados')
            continue
        }
        const externalId = typeof entry.externalId === 'string' || typeof entry.externalId === 'number' ? fold(entry.externalId) : ''
        const name = typeof entry.name === 'string' ? entry.name.trim() : ''
        let game = externalId ? byExternal.get(gameKey(provider, externalId)) : null
        let via = 'externalId'
        if (game && name && titleKey(name) !== titleKey(game.name)) {
            reject(index, entry, `o nome não confere com o id (${game.name})`)
            continue
        }
        if (!game && name) {
            const found = byTitle.get(gameKey(provider, titleKey(name))) ?? []
            if (found.length > 1) {
                reject(index, entry, `nome ambíguo: ${found.map((g) => g.id).join(', ')}`)
                continue
            }
            game = found[0]
            via = 'name'
        }
        if (!game) {
            reject(index, entry, 'nenhum jogo correspondente')
            continue
        }
        candidates.push({ index, entry, game, image, via })
    }

    const gamesBySrc = new Map()
    const byGame = new Map()
    for (const candidate of candidates) {
        gamesBySrc.set(candidate.image.src, new Set([...(gamesBySrc.get(candidate.image.src) ?? []), candidate.game.id]))
        byGame.set(candidate.game.id, [...(byGame.get(candidate.game.id) ?? []), candidate])
    }
    const matches = []
    for (const [, list] of byGame) {
        const usable = list.filter((candidate) => {
            const shared = gamesBySrc.get(candidate.image.src).size
            if (shared > 1) reject(candidate.index, candidate.entry, `a mesma imagem foi indicada para ${shared} jogos`)
            return shared === 1
        })
        if (!usable.length) continue
        const sources = new Set(usable.map((candidate) => candidate.image.src))
        const byId = new Set(usable.filter((candidate) => candidate.via === 'externalId').map((candidate) => candidate.image.src))
        // Different pictures for one game: the externalId match wins when it is unanimous, else none.
        const chosen = sources.size === 1 ? usable[0].image.src : byId.size === 1 ? [...byId][0] : null
        for (const candidate of usable) {
            if (candidate.image.src !== chosen) reject(candidate.index, candidate.entry, chosen ? 'imagem diferente da indicada pelo id do jogo' : 'imagens diferentes para o mesmo jogo')
        }
        if (chosen) matches.push(usable.find((candidate) => candidate.image.src === chosen))
    }
    return { matches, rejected }
}

const blocked = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
    blocked.addSubnet(net, prefix, 'ipv4')
}
// IPv4-mapped addresses (::ffff:a.b.c.d) are refused in isPublicAddress: in a BlockList that
// range would also match every plain IPv4 address.
for (const [net, prefix] of [['::', 127], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]) {
    blocked.addSubnet(net, prefix, 'ipv6')
}

export function isPublicAddress(address) {
    const value = String(address ?? '')
    const family = isIP(value)
    if (family === 6 && /^(0{0,4}:){0,5}:?ffff:/i.test(value)) return false
    return family !== 0 && !blocked.check(value, family === 6 ? 'ipv6' : 'ipv4')
}

// dns.lookup for https.request that only yields public addresses. The check runs when the socket
// opens, so a DNS answer cannot change between the check and the connection.
export function safeLookup(resolve = dns.lookup) {
    return (hostname, options, callback) => {
        const opts = typeof options === 'number' ? { family: options } : { ...(options ?? {}) }
        resolve(hostname, { ...opts, all: true }, (error, addresses) => {
            if (error) return callback(error)
            const list = Array.isArray(addresses) ? addresses : []
            if (!list.length || list.some((item) => !isPublicAddress(item.address))) {
                return callback(Object.assign(new Error(`${hostname} resolve para um endereço não público`), { code: 'EADDRNOTPUBLIC' }))
            }
            if (opts.all) return callback(null, list)
            return callback(null, list[0].address, list[0].family)
        })
    }
}

function httpsGet(url, { headers, timeoutMs, lookup }) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers, timeout: timeoutMs, lookup }, resolve)
        request.on('timeout', () => request.destroy(Object.assign(new Error('tempo esgotado'), { code: 'ETIMEDOUT' })))
        request.on('error', reject)
    })
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])

// One authorized image URL -> checked file facts ({ type, width, height, bytes, sha256, url }) or { error }.
export async function fetchImage(src, { hosts, get = httpsGet, lookup = safeLookup(), timeoutMs = 15_000, maxRedirects = 3 } = {}) {
    let url = imageUrl(src, hosts)
    if (!url) return { error: 'URL fora da política de imagens' }
    const headers = { accept: 'image/avif,image/webp,image/png,image/jpeg', 'user-agent': '123bet-catalog-images/1.0' }
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
        let response
        try {
            response = await get(url, { headers, timeoutMs, lookup })
        } catch (error) {
            return { error: `falha de rede: ${error.code ?? error.message}` }
        }
        if (REDIRECTS.has(response.statusCode)) {
            response.resume()
            let next = null
            try {
                next = imageUrl(new URL(response.headers.location ?? '', url).href, hosts)
            } catch { /* invalid Location */ }
            if (!next) return { error: 'redirecionamento para fora dos hosts autorizados' }
            url = next
            continue
        }
        if (response.statusCode !== 200) {
            response.resume()
            return { error: `HTTP ${response.statusCode}` }
        }
        if (Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
            response.destroy()
            return { error: 'arquivo grande demais' }
        }
        const chunks = []
        let size = 0
        try {
            for await (const chunk of response) {
                size += chunk.length
                if (size > MAX_IMAGE_BYTES) {
                    response.destroy()
                    return { error: 'arquivo grande demais' }
                }
                chunks.push(chunk)
            }
        } catch (error) {
            return { error: `falha de rede: ${error.code ?? error.message}` }
        }
        const checked = checkImageFile(Buffer.concat(chunks), response.headers['content-type'])
        return checked.error ? checked : { ...checked, url, checkedAt: new Date().toISOString() }
    }
    return { error: 'redirecionamentos demais' }
}

// Downloads each URL once (cache by URL, then content hash) and drops failures and identical files
// shared by different games (usually a generic "coming soon" picture).
export async function verifyImages(matches, { fetch, cache = new Map(), refresh = false, concurrency = 4 }) {
    const rejected = []
    const pending = new Map()
    const check = (src) => {
        if (!refresh && cache.get(src) && !cache.get(src).error) return Promise.resolve(cache.get(src))
        if (!pending.has(src)) pending.set(src, fetch(src).then((info) => (info.error ? info : (cache.set(src, info), info))))
        return pending.get(src)
    }
    const results = new Array(matches.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(concurrency, matches.length) }, async () => {
        while (next < matches.length) {
            const position = next
            next += 1
            const match = matches[position]
            const main = await check(match.image.src)
            const variants = {}
            for (const format of ['avif', 'webp']) {
                if (!match.image[format]) continue
                const info = await check(match.image[format])
                variants[format] = !info.error && info.type === `image/${format}` ? match.image[format] : null
            }
            results[position] = { match, main, variants }
        }
    }))
    const byHash = new Map()
    for (const { match, main } of results) {
        if (!main.error) byHash.set(main.sha256, new Set([...(byHash.get(main.sha256) ?? []), match.game.id]))
    }
    const verified = []
    for (const { match, main, variants } of results) {
        if (main.error) {
            rejected.push({ index: match.index, gameId: match.game.id, reason: `falha na verificação: ${main.error}` })
            continue
        }
        if (byHash.get(main.sha256).size > 1) {
            rejected.push({ index: match.index, gameId: match.game.id, reason: 'arquivo idêntico ao de outro jogo' })
            continue
        }
        verified.push({ ...match, image: { ...match.image, ...variants, width: main.width, height: main.height }, sha256: main.sha256 })
    }
    return { matches: verified, rejected }
}

// Writes the covers and the authorization record; --replace clears this source's covers not matched now.
export function applyImages(catalog, matches, { source, replace = false, now = new Date() }) {
    const covers = new Map(matches.map((match) => [match.game.id, match.image]))
    const games = (catalog.games ?? []).map((game) => {
        const image = covers.get(game.id)
        if (image) return { ...game, image: { ...image, sourceId: source.id } }
        if (replace && game.image?.sourceId === source.id) return { ...game, image: null }
        return game
    })
    const previous = (catalog.imageSources ?? []).find((item) => item.id === source.id)
    const record = {
        id: source.id,
        name: source.name ?? source.id,
        hosts: [...new Set([...(previous?.hosts ?? []), ...source.hosts])],
        authorization: source.authorization,
        termsUrl: source.termsUrl ?? previous?.termsUrl ?? null,
        recordedAt: previous?.recordedAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
        covers: games.filter((game) => game.image?.sourceId === source.id).length,
    }
    const { games: _games, imageSources: _sources, ...rest } = catalog
    return {
        ...rest,
        generatedAt: now.toISOString(),
        imageSources: [...(catalog.imageSources ?? []).filter((item) => item.id !== source.id), record],
        games,
    }
}

// Coverage per provider, for the report and the PR.
export function coverage(games) {
    const rows = PROVIDERS.map((provider) => {
        const list = games.filter((game) => game.provider === provider.id)
        return { provider: provider.id, games: list.length, withImage: list.filter((game) => game.image?.src).length }
    }).filter((row) => row.games > 0)
    return { total: rows.reduce((sum, row) => sum + row.games, 0), withImage: rows.reduce((sum, row) => sum + row.withImage, 0), providers: rows }
}

async function readCache() {
    try {
        return new Map(Object.entries(JSON.parse(await readFile(CACHE_PATH, 'utf8'))))
    } catch {
        return new Map()
    }
}

async function writeCache(cache) {
    await mkdir(path.dirname(CACHE_PATH), { recursive: true })
    await writeFile(CACHE_PATH, `${JSON.stringify(Object.fromEntries(cache), null, 1)}\n`)
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const usage = 'Uso: node scripts/casino/importImages.mjs --manifest <arquivo.json> --source <id> --hosts <host[,host]> --authorization "<referência escrita>" [--verify] [--write]'
    if (!args.manifest || !args.source || !args.hosts) throw new Error(usage)
    if (!/^[a-z0-9-]{2,40}$/.test(args.source)) throw new Error('--source deve usar letras minúsculas, números e hífens.')
    if (!args.authorization || args.authorization.trim().length < 10) throw new Error('Informe --authorization com a referência da autorização de uso das imagens.')
    const hosts = new Set(args.hosts.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean))
    for (const host of hosts) if (!isPublicHostname(host)) throw new Error(`Host inválido em --hosts: ${host}`)
    if (args.write && !args.verify) throw new Error('--write exige --verify: toda capa gravada precisa ter sido baixada e conferida.')

    const manifest = JSON.parse(await readFile(args.manifest, 'utf8'))
    const entries = Array.isArray(manifest) ? manifest : manifest?.images
    if (!Array.isArray(entries)) throw new Error('O manifesto deve ser uma lista (ou { "images": [...] }).')
    const current = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
    const matched = matchImages(current.games ?? [], entries, { hosts })
    let { matches } = matched
    const rejected = [...matched.rejected]
    if (args.verify) {
        const cache = await readCache()
        const verified = await verifyImages(matches, { fetch: (src) => fetchImage(src, { hosts }), cache, refresh: Boolean(args.refresh) })
        await writeCache(cache)
        matches = verified.matches
        rejected.push(...verified.rejected)
    }
    const source = { id: args.source, name: args.name, hosts: [...hosts], authorization: args.authorization.trim().slice(0, 300), termsUrl: args['terms-url'] ?? null }
    const next = applyImages(current, matches, { source, replace: Boolean(args.replace) })
    const reasons = new Map()
    for (const item of rejected) reasons.set(item.reason.replace(/:.*$/, ''), (reasons.get(item.reason.replace(/:.*$/, '')) ?? 0) + 1)
    const report = { manifest: path.basename(args.manifest), received: entries.length, matched: matches.length, verified: Boolean(args.verify), rejected, coverage: coverage(next.games) }
    console.log(`Manifesto: ${entries.length} entradas; ${matches.length} capas ${args.verify ? 'verificadas' : 'correspondidas (sem download)'}; ${rejected.length} rejeitadas.`)
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${count} × ${reason}`)
    for (const row of report.coverage.providers) console.log(`  ${row.provider}: ${row.withImage}/${row.games}`)
    if (args.report) await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`)
    if (!args.write) {
        console.log('Simulação: nada foi gravado. Use --verify --write para aplicar.')
        return
    }
    await writeFile(CATALOG_PATH, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`Catálogo atualizado: ${report.coverage.withImage} de ${report.coverage.total} jogos com capa.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(error.message)
        process.exit(1)
    })
}
