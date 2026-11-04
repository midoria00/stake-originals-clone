// Splits the full Plinko drop-position table (scripts/data/plinko-outcomes.full.json, 15.8 MB, built by
// generatePlinkoOutcomes.cjs) into one small file per row count: public/plinko/outcomes-<rows>.json.
// Each bin keeps at most MAX_POSITIONS_PER_BIN positions, taken at evenly spaced ranks of the sorted list, so the
// subset covers the same range and density as the full table. Every kept value is an original position
// (drop X values are never recomputed), so the physics still lands the ball in the same bin.
// Run: node scripts/splitPlinkoOutcomes.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 32 per bin: rows 8-16 need 9-17 bins, about 10 KB per row for the widest board. The 9 rarest edge bins (7-28 originals) have fewer
// than 32 originals and keep all of them; the common bins have thousands, so 32 quantiles still sample them evenly.
export const MAX_POSITIONS_PER_BIN = 32

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE_FILE = path.join(ROOT, 'scripts', 'data', 'plinko-outcomes.full.json')
export const OUTPUT_DIR = path.join(ROOT, 'public', 'plinko')

// Deterministic: sort, then take the middle of each of `max` equal-sized rank slices.
export function selectEvenly(positions, max = MAX_POSITIONS_PER_BIN) {
    const sorted = [...positions].sort((a, b) => a - b)
    if (sorted.length <= max) return sorted
    return Array.from({ length: max }, (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / max)])
}

// full: { [rows]: { [bin]: number[] } } -> { [rows]: { [bin]: number[] } } with bins that have no positions left out.
export function reduceOutcomes(full, max = MAX_POSITIONS_PER_BIN) {
    const reduced = {}
    for (const [rows, bins] of Object.entries(full)) {
        reduced[rows] = {}
        for (const [bin, positions] of Object.entries(bins)) {
            if (Array.isArray(positions) && positions.length > 0) reduced[rows][bin] = selectEvenly(positions, max)
        }
    }
    return reduced
}

export const outcomeFileName = (rows) => `outcomes-${rows}.json`

export function writeSplitOutcomes(sourceFile = SOURCE_FILE, outputDir = OUTPUT_DIR, max = MAX_POSITIONS_PER_BIN) {
    const reduced = reduceOutcomes(JSON.parse(readFileSync(sourceFile, 'utf8')), max)
    mkdirSync(outputDir, { recursive: true })
    const written = []
    for (const [rows, bins] of Object.entries(reduced)) {
        const file = path.join(outputDir, outcomeFileName(rows))
        const body = JSON.stringify(bins)
        writeFileSync(file, body)
        written.push({ rows: Number(rows), file, bytes: Buffer.byteLength(body) })
    }
    return written
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    for (const { rows, bytes } of writeSplitOutcomes()) console.log(`rows ${rows}: ${bytes} bytes`)
}
