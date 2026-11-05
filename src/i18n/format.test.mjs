import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMultiplier, truncateMultiplier } from './format.js'

// The Crash screen must never show more than the cash out pays (claims and the server clock are
// floored to 0.01x), and exact two-decimal crash points must survive binary rounding.
test('live multipliers are cut, not rounded, to 0.01x', () => {
    assert.equal(truncateMultiplier(1.146), 1.14)
    assert.equal(truncateMultiplier(1.149999), 1.14)
    assert.equal(truncateMultiplier(1.15), 1.15)
    assert.equal(truncateMultiplier(Math.exp(0.1 * 1.4)), Math.floor(Math.exp(0.1 * 1.4) * 100) / 100)
    for (const exact of [1, 1.01, 2.3, 8.18, 10.07, 99.99, 1000]) assert.equal(truncateMultiplier(exact), exact)
    assert.equal(formatMultiplier(truncateMultiplier(1.146)), '1.14×')
})
