import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { loadOutcomes } from './src/components/PlinkoGame/outcomes.js'
import { ROW_COUNT_OPTIONS } from './src/components/PlinkoGame/constants.js'
import { MAX_POSITIONS_PER_BIN, OUTPUT_DIR, SOURCE_FILE, outcomeFileName, reduceOutcomes, selectEvenly } from './scripts/splitPlinkoOutcomes.mjs'

const full = JSON.parse(readFileSync(SOURCE_FILE, 'utf8'))
const readRow = (rows) => JSON.parse(readFileSync(path.join(OUTPUT_DIR, outcomeFileName(rows)), 'utf8'))

test('plinko outcomes: every row file has the bins, only original positions and min(N, original) per bin', () => {
    for (const rows of ROW_COUNT_OPTIONS) {
        const original = full[rows]
        const subset = readRow(rows)
        const expectedBins = Object.keys(original).filter((bin) => original[bin].length > 0)
        assert.equal(expectedBins.length, rows + 1, `rows ${rows}: source has every bin`)
        assert.deepEqual(Object.keys(subset).sort(), expectedBins.sort(), `rows ${rows}: bins`)
        for (const bin of expectedBins) {
            const known = new Set(original[bin])
            assert.ok(subset[bin].every((x) => known.has(x)), `rows ${rows} bin ${bin}: position not in original table`)
            assert.equal(subset[bin].length, Math.min(MAX_POSITIONS_PER_BIN, original[bin].length), `rows ${rows} bin ${bin}: count`)
            assert.equal(new Set(subset[bin]).size, subset[bin].length, `rows ${rows} bin ${bin}: distinct`)
        }
    }
})

test('plinko outcomes: committed files match what the script produces (deterministic)', () => {
    const rebuilt = reduceOutcomes(full)
    for (const rows of ROW_COUNT_OPTIONS) assert.deepEqual(readRow(rows), rebuilt[rows])
})

test('plinko outcomes: selectEvenly keeps short lists, spreads long ones and is stable', () => {
    assert.deepEqual(selectEvenly([3, 1, 2], 5), [1, 2, 3])
    const many = Array.from({ length: 1000 }, (_, i) => 1000 - i)
    const picked = selectEvenly(many, 10)
    assert.deepEqual(picked, selectEvenly(many, 10))
    assert.equal(picked.length, 10)
    assert.ok(picked.every((value, i) => i === 0 || value > picked[i - 1]))
    assert.ok(picked[0] <= 100 && picked[9] >= 900)
})

test('plinko outcomes: loader fetches one row once, caches it and retries after a failure', async () => {
    const calls = []
    const okFetch = async (url) => { calls.push(url); return { ok: true, json: async () => ({ 0: [1] }) } }
    const [a, b] = await Promise.all([loadOutcomes(8, okFetch), loadOutcomes(8, okFetch)])
    assert.deepEqual(a, { 0: [1] })
    assert.equal(a, b)
    await loadOutcomes(9, okFetch)
    assert.deepEqual(calls, ['/plinko/outcomes-8.json', '/plinko/outcomes-9.json'])

    let attempts = 0
    const flaky = async () => (++attempts === 1 ? { ok: false } : { ok: true, json: async () => ({ 0: [2] }) })
    await assert.rejects(loadOutcomes(10, flaky))
    assert.deepEqual(await loadOutcomes(10, flaky), { 0: [2] })
    assert.equal(attempts, 2)
})
