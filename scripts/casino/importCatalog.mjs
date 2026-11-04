#!/usr/bin/env node
// Imports a game catalog that an authorized partner (aggregator or provider) supplied, into
// server/casino/data/catalog.json. Only use files you are allowed to use; the authorization
// reference is stored with the import.
//
//   node scripts/casino/importCatalog.mjs --source hub88 --file export.json --authorization "Contrato X, cláusula Y" [--replace]
//
// Input: a JSON array (or { "games": [...] }) whose entries use the catalog field names:
//   provider (registry id or provider name), externalId, name, category, image | { src, avif, webp },
//   description, platforms, languages, rtp | { min, max }, volatility, available, demo | demoUrl, addedAt.
// Feeds with other field names need a mapping step before this script; none is guessed here.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dedupeGames, normalizeGame } from '../../server/casino/catalog.js'
import { isSourceId } from '../../server/casino/sources.js'

const CATALOG_PATH = fileURLToPath(new URL('../../server/casino/data/catalog.json', import.meta.url))

export function parseArgs(argv) {
    const args = {}
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i]
        if (key === '--replace') args.replace = true
        else if (key.startsWith('--')) args[key.slice(2)] = argv[(i += 1)]
    }
    return args
}

// slot.report "mechanic" values that name a non-slot game type; everything else is a slot (it is a slot database).
const SLOT_REPORT_MECHANICS = { plinko: 'plinko', crash: 'crash', roulette: 'roulette', blackjack: 'blackjack', scratch: 'instant', 'instant win': 'instant', instantwin: 'instant' }

const decodeAmp = (value) => (typeof value === 'string' ? value.replace(/&amp;/g, '&') : value)

// The feed mixes "2021-02-25" with "25.02.2021" (day first: every such date matches the record's "year").
const slotReportDate = (value) => {
    const dmy = typeof value === 'string' && /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
    return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : value
}

// slot.report /api/v1/slots.json, fields as documented at https://slot.report/api/ -> catalog fields.
// Its "slug" is kept as the original id; it has no images and no demos.
export function fromSlotReport(input) {
    const results = Array.isArray(input) ? input : input?.results
    if (!Array.isArray(results)) throw new Error('Arquivo do slot.report sem a lista "results".')
    return results.map((slot) => ({
        provider: slot?.provider_slug || slot?.provider,
        externalId: slot?.slug,
        name: decodeAmp(slot?.name),
        category: SLOT_REPORT_MECHANICS[String(slot?.mechanic ?? '').trim().toLowerCase()] ?? 'slots',
        rtp: slot?.rtp,
        volatility: slot?.volatility,
        features: Array.isArray(slot?.features) ? slot.features.map(decodeAmp) : slot?.features,
        maxWin: slot?.max_win,
        releasedAt: slotReportDate(slot?.release_date),
    }))
}

export function mergeCatalog(current, { source, entries, authorization, file, replace = false, now = new Date() }) {
    if (!isSourceId(source)) throw new Error(`Fonte desconhecida: ${source}`)
    if (!authorization || authorization.trim().length < 5) throw new Error('Informe --authorization com a referência da autorização de uso do catálogo.')
    if (!Array.isArray(entries)) throw new Error('O arquivo deve conter uma lista de jogos.')
    const accepted = []
    const rejected = []
    for (const [position, raw] of entries.entries()) {
        const { game, error } = normalizeGame(raw, source, now)
        if (game) accepted.push(game)
        else rejected.push({ position, error })
    }
    const kept = (current.games ?? []).filter((game) => !(replace && game.source === source))
    const { games, duplicates } = dedupeGames([...kept, ...accepted])
    const record = {
        source,
        file: path.basename(file ?? 'entrada'),
        authorization: authorization.trim().slice(0, 300),
        importedAt: now.toISOString(),
        received: entries.length,
        accepted: accepted.length,
        rejected: rejected.length,
        duplicates: duplicates.length,
        replace,
    }
    return {
        catalog: { version: 1, generatedAt: now.toISOString(), imports: [...(current.imports ?? []), record].slice(-50), games },
        record,
        rejected,
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (!args.source || !args.file) {
        console.error('Uso: node scripts/casino/importCatalog.mjs --source <id> --file <arquivo.json> --authorization "<referência>" [--replace]')
        process.exit(1)
    }
    const input = JSON.parse(await readFile(args.file, 'utf8'))
    const current = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
    const { catalog, record, rejected } = mergeCatalog(current, {
        source: args.source,
        entries: args.source === 'slot-report' ? fromSlotReport(input) : Array.isArray(input) ? input : input?.games,
        authorization: args.authorization,
        file: args.file,
        replace: Boolean(args.replace),
    })
    await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`)
    console.log(`Importação concluída: ${record.accepted} aceitos, ${record.rejected} rejeitados, ${record.duplicates} duplicados; catálogo com ${catalog.games.length} jogos externos.`)
    // Grouped reasons, e.g. "37 × provedor fora do cadastro: NoLimit City" tells which providers to register.
    const reasons = new Map()
    for (const item of rejected) reasons.set(item.error, (reasons.get(item.error) ?? 0) + 1)
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${count} × ${reason}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(error.message)
        process.exit(1)
    })
}
