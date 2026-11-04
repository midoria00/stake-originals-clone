import test from 'node:test'
import assert from 'node:assert/strict'
import {
    diceRoll, diceWinChance, diceMultiplier, isDiceWin, dicePayout, resolveDice,
    validateStake, validateTarget, parseDecimal,
} from './dice.js'

// Exact enumeration: every roll 0.00..100.00 is equally likely (10,001 outcomes).
const rollFromIndex = (k) => diceRoll((k + 0.5) / 10001)

function exactReturn(target, direction) {
    let wins = 0
    for (let k = 0; k <= 10000; k++) if (isDiceWin(rollFromIndex(k), target, direction)) wins++
    const mult = diceMultiplier(diceWinChance(target, direction))
    return { wins, probability: wins / 10001, multiplier: mult, rtp: (wins * mult) / 10001 }
}

test('roll maps r to 10,001 distinct outcomes', () => {
    const seen = new Set()
    for (let k = 0; k <= 10000; k++) seen.add(rollFromIndex(k))
    assert.equal(seen.size, 10001)
    assert.equal(diceRoll(0), 0)
    assert.equal(diceRoll(0.9999999999), 100)
    assert.equal(diceRoll(0.5), 50)
    assert.throws(() => diceRoll(1))
    assert.throws(() => diceRoll(-0.1))
    assert.throws(() => diceRoll(NaN))
})

test('exact return over all 10,001 outcomes (reported)', () => {
    const cases = [[2, 'under'], [10, 'under'], [25, 'under'], [49.5, 'under'], [50, 'under'], [50, 'over'], [75, 'over'], [90, 'over'], [98, 'under'], [98, 'over'], [2, 'over']]
    const lines = []
    for (const [target, direction] of cases) {
        const { wins, probability, multiplier, rtp } = exactReturn(target, direction)
        lines.push(`${direction} ${target}: wins=${wins}/10001 p=${(probability * 100).toFixed(4)}% mult=${multiplier} RTP=${(rtp * 100).toFixed(4)}%`)
        // Win count is exact: under T -> T*100 outcomes (0..T-0.01); over T -> (100-T)*100 outcomes.
        assert.equal(wins, Math.round(diceWinChance(target, direction) * 100))
        assert.ok(rtp < 1, `${direction} ${target} rtp=${rtp}`)
        assert.ok(rtp > 0.98, `${direction} ${target} rtp=${rtp}`)
    }
    console.log(lines.join('\n'))
})

test('return never exceeds 100% for any allowed target and direction', () => {
    let worst = 0
    for (let c = 200; c <= 9800; c++) {
        const target = c / 100
        for (const direction of ['under', 'over']) {
            const wins = direction === 'under' ? c : 10000 - c // closed form of the enumeration above
            worst = Math.max(worst, (wins * diceMultiplier(diceWinChance(target, direction))) / 10001)
        }
    }
    assert.ok(worst < 1, `worst=${worst}`)
    console.log(`max RTP over all 9,601 targets x 2 directions = ${(worst * 100).toFixed(4)}%`)
})

test('boundaries: roll equal to target loses both ways', () => {
    assert.equal(isDiceWin(50, 50, 'under'), false)
    assert.equal(isDiceWin(50, 50, 'over'), false)
    assert.equal(isDiceWin(49.99, 50, 'under'), true)
    assert.equal(isDiceWin(50.01, 50, 'over'), true)
    assert.equal(isDiceWin(0, 2, 'under'), true)
    assert.equal(isDiceWin(100, 98, 'over'), true)
})

test('chance and multiplier', () => {
    assert.equal(diceWinChance(30, 'under'), 30)
    assert.equal(diceWinChance(30, 'over'), 70)
    assert.equal(diceWinChance(50.01, 'over'), 49.99)
    assert.equal(diceMultiplier(50), 1.98)
    assert.equal(diceMultiplier(2), 49.5)
    assert.equal(diceMultiplier(98), 1.0102)
    assert.equal(diceMultiplier(33), 3)
    assert.equal(dicePayout(10, 1.98), 19.8)
    assert.equal(dicePayout(0.1, 1.0102), 0.1)
    assert.equal(dicePayout(3.33, 1.0102), 3.36)
})

test('resolveDice', () => {
    assert.deepEqual(resolveDice({ r: 0.1, stake: 10, target: 50, direction: 'under' }), { roll: 10, win: true, multiplier: 1.98, payout: 19.8 })
    const lose = resolveDice({ r: 0.9, stake: 10, target: 50, direction: 'under' })
    assert.equal(lose.win, false)
    assert.equal(lose.payout, 0)
})

test('parse and validate stake', () => {
    assert.equal(parseDecimal('12,5'), 12.5)
    assert.ok(Number.isNaN(parseDecimal('1.234')))
    assert.ok(Number.isNaN(parseDecimal('abc')))
    assert.ok(Number.isNaN(parseDecimal('')))
    assert.ok(Number.isNaN(parseDecimal('-1')))
    assert.ok(Number.isNaN(parseDecimal('1e3')))
    assert.deepEqual(validateStake('0,10', 100), { ok: true, value: 0.1 })
    assert.equal(validateStake('0,09', 100).code, 'stakeMin')
    assert.equal(validateStake('10000,01', 99999).code, 'stakeMax')
    assert.deepEqual(validateStake('10000', 10000), { ok: true, value: 10000 })
    assert.equal(validateStake('50', 49.99).code, 'stakeBalance')
    assert.equal(validateStake('x', 100).code, 'stakeInvalid')
    assert.equal(validateStake('5', NaN).code, 'stakeBalance')
})

test('validate target', () => {
    assert.deepEqual(validateTarget('2'), { ok: true, value: 2 })
    assert.deepEqual(validateTarget('98,00'), { ok: true, value: 98 })
    assert.equal(validateTarget('1,99').code, 'targetRange')
    assert.equal(validateTarget('98,01').code, 'targetRange')
    assert.equal(validateTarget('50,123').code, 'targetInvalid')
    assert.equal(validateTarget('').code, 'targetInvalid')
})
