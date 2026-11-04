import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { hasKey, t } from './index.js'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function sourceFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return entry.name === 'vendor' ? [] : sourceFiles(full)
        return /\.(jsx?|mjs)$/.test(entry.name) && !entry.name.endsWith('.test.mjs') ? [full] : []
    }))
    return nested.flat()
}

// Every literal t('namespace.key') in the app must exist in pt-BR (plural keys via _one/_other).
test('i18n: every static translation key used in src exists in pt-BR', async () => {
    const missing = []
    for (const file of await sourceFiles(SRC)) {
        const text = await readFile(file, 'utf8')
        for (const [, key] of text.matchAll(/\bt\(\s*'([A-Za-z0-9_.-]+)'/g)) {
            if (!hasKey(key) && !hasKey(`${key}_other`)) missing.push(`${path.relative(SRC, file)}: ${key}`)
        }
    }
    assert.deepEqual(missing, [])
})

test('i18n: interpolation and plurals', () => {
    assert.equal(t('pages.casino.count', { count: 1 }), '1 jogo')
    assert.equal(t('pages.casino.count', { count: 6 }), '6 jogos')
    assert.equal(t('casino.results', { count: 0 }), '0 jogos encontrados', 'zero reads as plural in pt-BR')
    assert.equal(t('casino.results', { count: 1 }), '1 jogo encontrado')
    assert.equal(t('common.noResults', { query: 'x' }), 'Nenhum resultado para "x".')
    assert.equal(t('does.not.exist'), 'does.not.exist')
})
