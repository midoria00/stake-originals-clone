import assert from 'node:assert/strict'
import test from 'node:test'
import { BIN_PAYOUTS, ROW_COUNT_OPTIONS } from './constants.js'

const choose = (n, k) => {
    let value = 1
    for (let i = 1; i <= k; i++) value = (value * (n - k + i)) / i
    return value
}

// The fair path sends the ball right with probability 1/2 per row, so the bin is Binomial(rows, 1/2).
// Backs the "98,9% a 99,2%" figure on the "Como funcionam os jogos" page.
test('plinko: theoretical return is between 98.9% and 99.2% for every row count and risk', () => {
    for (const rows of ROW_COUNT_OPTIONS) {
        for (const [risk, payouts] of Object.entries(BIN_PAYOUTS[rows])) {
            assert.equal(payouts.length, rows + 1, `${rows}/${risk} has one payout per bin`)
            const expected = payouts.reduce((total, payout, bin) => total + (choose(rows, bin) / 2 ** rows) * payout, 0)
            assert.ok(expected > 0.989 && expected < 0.992, `${rows}/${risk}: ${(expected * 100).toFixed(3)}%`)
        }
    }
})
