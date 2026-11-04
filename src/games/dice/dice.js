// Dice rules (123 Coins simulator). Pure functions: no React, no wallet, no randomness source.
export const STAKE_MIN = 0.1
export const STAKE_MAX = 10000
export const TARGET_MIN = 2
export const TARGET_MAX = 98

export const round2 = (value) => Math.round(value * 100) / 100

// Accepts a number or a pt-BR/en string ("12,5", "12.50"). Returns NaN unless it has at most 2 decimals.
export function parseDecimal(input, maxDecimals = 2) {
    if (typeof input === 'number') return Number.isFinite(input) && round2(input) === input ? input : NaN
    if (typeof input !== 'string') return NaN
    const text = input.trim().replace(',', '.')
    const match = /^(\d+)(?:\.(\d*))?$/.exec(text)
    if (!match || (match[2] ?? '').length > maxDecimals) return NaN
    return Number(text)
}

// Shared by Dice and Limbo. Error codes map to `<game>.errors.<code>`.
export function validateStake(input, balance) {
    const value = parseDecimal(input)
    if (!Number.isFinite(value)) return { ok: false, code: 'stakeInvalid' }
    if (value < STAKE_MIN) return { ok: false, code: 'stakeMin' }
    if (value > STAKE_MAX) return { ok: false, code: 'stakeMax' }
    if (!(value <= round2(Number(balance)))) return { ok: false, code: 'stakeBalance' }
    return { ok: true, value }
}

export function validateDirection(direction) {
    return direction === 'under' || direction === 'over'
}

export function validateTarget(input) {
    const value = parseDecimal(input)
    if (!Number.isFinite(value)) return { ok: false, code: 'targetInvalid' }
    if (value < TARGET_MIN || value > TARGET_MAX) return { ok: false, code: 'targetRange' }
    return { ok: true, value }
}

function assertFraction(r) {
    if (!Number.isFinite(r) || r < 0 || r >= 1) throw new RangeError('r must be in [0, 1)')
}

// 0.00 .. 100.00 in steps of 0.01 (10,001 equally likely outcomes).
export function diceRoll(r) {
    assertFraction(r)
    return Math.floor(r * 10001) / 100
}

export function diceWinChance(target, direction) {
    return direction === 'over' ? round2(100 - target) : target
}

export function diceMultiplier(chance) {
    return Math.floor((99 / chance) * 10000) / 10000
}

export function isDiceWin(roll, target, direction) {
    return direction === 'over' ? roll > target : roll < target
}

export const dicePayout = (stake, multiplier) => round2(stake * multiplier)

// Full resolution of one round from the fair float r.
export function resolveDice({ r, stake, target, direction }) {
    const roll = diceRoll(r)
    const multiplier = diceMultiplier(diceWinChance(target, direction))
    const win = isDiceWin(roll, target, direction)
    return { roll, win, multiplier, payout: win ? dicePayout(stake, multiplier) : 0 }
}
