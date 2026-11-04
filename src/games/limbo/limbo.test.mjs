import test from 'node:test'
import assert from 'node:assert/strict'
import { limboResult, isLimboWin, limboWinChance, limboPayout, resolveLimbo, validateTarget, validateStake } from './limbo.js'

test('result formula and caps', () => {
    assert.equal(limboResult(0), 1)
    assert.equal(limboResult(0.5), 1.98)
    assert.equal(limboResult(0.9), 9.9)
    assert.equal(limboResult(1 - 1e-12), 1_000_000)
    assert.ok(limboResult(0.0001) >= 1)
    assert.throws(() => limboResult(1))
    assert.throws(() => limboResult(-1))
})

test('win probability = 0.99 / target, via exact r thresholds', () => {
    const lines = []
    for (const t of [1.01, 1.5, 2, 3.33, 10, 100, 1000, 12345.67, 1_000_000]) {
        const threshold = 1 - 0.99 / t // win iff r >= threshold
        const eps = Math.min(1e-9, (1 - threshold) / 1e3)
        const below = Math.max(0, threshold - eps)
        const above = Math.min(1 - Number.EPSILON, threshold + eps)
        assert.equal(isLimboWin(limboResult(below), t), false, `t=${t} just below threshold must lose`)
        assert.equal(isLimboWin(limboResult(above), t), true, `t=${t} just above threshold must win`)
        const p = 1 - threshold
        assert.ok(Math.abs(p - limboWinChance(t)) < 1e-12)
        // Return = P(win) * target = 0.99 for every target.
        assert.ok(Math.abs(limboWinChance(t) * t - 0.99) < 1e-9)
        lines.push(`target ${t}: P(win)=${(limboWinChance(t) * 100).toPrecision(6)}% return=${(limboWinChance(t) * t * 100).toFixed(4)}%`)
    }
    console.log(lines.join('\n'))
})

test('uniform r grid agrees with analytic probability', () => {
    const N = 200000
    for (const t of [1.5, 2, 5]) {
        let wins = 0
        for (let i = 0; i < N; i++) if (isLimboWin(limboResult((i + 0.5) / N), t)) wins++
        assert.ok(Math.abs(wins / N - 0.99 / t) < 2e-5, `t=${t} ${wins / N}`)
    }
})

test('payout', () => {
    assert.equal(limboPayout(10, 2), 20)
    assert.equal(limboPayout(0.1, 1.01), 0.1)
    assert.equal(limboPayout(3.33, 1.01), 3.36)
    assert.equal(limboPayout(10000, 1_000_000), 1e10)
    assert.deepEqual(resolveLimbo({ r: 0.5, stake: 10, target: 1.98 }), { result: 1.98, win: true, payout: 19.8 })
    assert.deepEqual(resolveLimbo({ r: 0.5, stake: 10, target: 1.99 }), { result: 1.98, win: false, payout: 0 })
})

test('validation', () => {
    assert.deepEqual(validateTarget('1,01'), { ok: true, value: 1.01 })
    assert.deepEqual(validateTarget('1000000'), { ok: true, value: 1_000_000 })
    assert.equal(validateTarget('1').code, 'targetRange')
    assert.equal(validateTarget('1000000,01').code, 'targetRange')
    assert.equal(validateTarget('2,555').code, 'targetInvalid')
    assert.equal(validateTarget('abc').code, 'targetInvalid')
    assert.equal(validateStake('0,05', 10).code, 'stakeMin')
    assert.equal(validateStake('11', 10).code, 'stakeBalance')
})
