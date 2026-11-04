import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { default: config } = await import('./vite.config.js')

// Tracking (upstream GTM-MZ825NFC, Vercel Analytics) stays out until explicitly authorized.
test('build injects no third-party tracking', async () => {
    const pluginNames = config.plugins.flat().map((plugin) => plugin?.name)
    assert.ok(!pluginNames.includes('google-tag-manager'), 'Google Tag Manager plugin is present')

    for (const file of ['./vite.config.js', './src/main.jsx', './index.html']) {
        const source = await readFile(new URL(file, import.meta.url), 'utf8')
        assert.doesNotMatch(source, /googletagmanager|GTM-|@vercel\/analytics/)
    }
})
