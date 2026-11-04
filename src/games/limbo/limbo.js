// Limbo rules (123 Coins simulator). Pure functions.
import { parseDecimal, round2 } from '../dice/dice.js'

export { validateStake, STAKE_MIN, STAKE_MAX } from '../dice/dice.js'
export const TARGET_MIN = 1.01
export const TARGET_MAX = 1_000_000

export function validateTarget(input) {
    const value = parseDecimal(input)
    if (!Number.isFinite(value)) return { ok: false, code: 'targetInvalid' }
    if (value < TARGET_MIN || value > TARGET_MAX) return { ok: false, code: 'targetRange' }
    return { ok: true, value }
}

export function limboResult(r) {
    if (!Number.isFinite(r) || r < 0 || r >= 1) throw new RangeError('r must be in [0, 1)')
    return Math.min(1_000_000, Math.max(1, Math.floor(99 / (1 - r)) / 100))
}

export const isLimboWin = (result, target) => result >= target

// Probability of result >= target (equivalently r >= 1 - 0.99 / target).
export const limboWinChance = (target) => 0.99 / target

export const limboPayout = (stake, target) => round2(stake * target)

export function resolveLimbo({ r, stake, target }) {
    const result = limboResult(r)
    const win = isLimboWin(result, target)
    return { result, win, payout: win ? limboPayout(stake, target) : 0 }
}
