// Server-authoritative rounds. Outcomes come from the server RNG (node:crypto) and use the same rule
// modules as the game screens; the browser only sends choices (stake, target, tile, cash out).
// Hidden state (mine positions, crash point) stays in game_rounds.secret until the round settles.
import { randomInt } from 'node:crypto'
import { diceMultiplier, diceRoll, diceWinChance, isDiceWin, validateDirection, validateTarget as validateDiceTarget } from '../../src/games/dice/dice.js'
import { limboResult, validateTarget as validateLimboTarget } from '../../src/games/limbo/limbo.js'
import { BIN_PAYOUTS, ROW_COUNT_OPTIONS } from '../../src/components/PlinkoGame/constants.js'
import { GRID_SIZE, MINES_MAX, MINES_MIN, minesMultiplier } from '../../src/games/mines/mines.js'
import { DINO_DIFFICULTIES, DINO_MAX_JUMPS, DINO_SURVIVAL, dinoMultiplier } from '../../src/games/dino/dino.js'
import { crashPointFromFloat } from '../../src/utils/ProvablyFair.js'
import { ApiError } from './http.js'
import { applyMultiplier, fail, idempotencyKey, int, oneOf, stakeCents, toBp, uuid } from './validate.js'

// randomInt accepts ranges below 2^48 only: 47 random bits give a float in [0, 1).
export const cryptoRng = {
    float: () => randomInt(0, 2 ** 47) / 2 ** 47,
    int: (min, max) => randomInt(min, max),
}

// Crash curve used by the game screen: multiplier = e^(0.1 * seconds).
export const CRASH_GROWTH = 0.1
export const crashMultiplierAt = (seconds) => Math.floor(Math.exp(CRASH_GROWTH * Math.max(0, seconds)) * 100) / 100
export const crashSecondsTo = (multiplier) => Math.log(multiplier) / CRASH_GROWTH
const WATCH_MAX_MS = 10_000

function publicRound(round) {
    if (!round) return null
    const { secret, ...rest } = round
    return rest
}

const target2 = (value, code) => {
    const checked = (code === 'dice' ? validateDiceTarget : validateLimboTarget)(typeof value === 'number' ? value : String(value ?? ''))
    if (!checked.ok) fail(`invalid_target`)
    return checked.value
}

// Instant games ----------------------------------------------------------------------------------

export async function playDice(ctx, body) {
    const stake = stakeCents(body.stake)
    const target = target2(body.target, 'dice')
    const direction = body.direction
    if (!validateDirection(direction)) fail('invalid_direction')
    const key = idempotencyKey(body.idempotencyKey)
    const roll = diceRoll(ctx.rng.float())
    const multiplier = diceMultiplier(diceWinChance(target, direction))
    const win = isDiceWin(roll, target, direction)
    const bp = toBp(multiplier)
    return ctx.rpc('play_instant_round', {
        p_user: ctx.userId, p_game: 'dice', p_stake: stake, p_payout: win ? applyMultiplier(stake, bp) : 0, p_multiplier_bp: win ? bp : 0,
        p_params: { target, direction }, p_result: { roll, win, multiplier }, p_idem: key,
    })
}

export async function playLimbo(ctx, body) {
    const stake = stakeCents(body.stake)
    const target = target2(body.target, 'limbo')
    const key = idempotencyKey(body.idempotencyKey)
    const result = limboResult(ctx.rng.float())
    const win = result >= target
    const bp = toBp(target)
    return ctx.rpc('play_instant_round', {
        p_user: ctx.userId, p_game: 'limbo', p_stake: stake, p_payout: win ? applyMultiplier(stake, bp) : 0, p_multiplier_bp: win ? bp : 0,
        p_params: { target }, p_result: { result, win }, p_idem: key,
    })
}

export async function playPlinko(ctx, body) {
    const stake = stakeCents(body.stake)
    const rows = int(body.rows, 8, 16, 'invalid_rows')
    if (!ROW_COUNT_OPTIONS.includes(rows)) fail('invalid_rows')
    const risk = oneOf(body.risk, ['low', 'medium', 'high'], 'invalid_risk')
    const key = idempotencyKey(body.idempotencyKey)
    const path = Array.from({ length: rows }, () => ctx.rng.int(0, 2))
    const binIndex = path.reduce((sum, step) => sum + step, 0)
    const multiplier = BIN_PAYOUTS[rows][risk][binIndex]
    const bp = toBp(multiplier)
    return ctx.rpc('play_instant_round', {
        p_user: ctx.userId, p_game: 'plinko', p_stake: stake, p_payout: applyMultiplier(stake, bp), p_multiplier_bp: bp,
        p_params: { rows, risk }, p_result: { path, binIndex, multiplier }, p_idem: key,
    })
}

// Interactive games: shared plumbing ----------------------------------------------------------------

async function loadOpen(ctx, roundId, game) {
    const data = await ctx.rpc('get_round', { p_user: ctx.userId, p_round: uuid(roundId, 'invalid_round') })
    if (data.round.game !== game) throw new ApiError(404, 'round_not_found')
    return data
}

const settle = (ctx, round, payout, bp, result) => ctx.rpc('settle_round', {
    p_user: ctx.userId, p_round: round.id, p_payout: payout, p_multiplier_bp: bp, p_result: result, p_expected_step: round.step,
})

// Starting a new round first closes an abandoned one exactly as if the player had cashed out now,
// so leaving a page never strands a stake and never yields more than a cash out would have.
async function openFresh(ctx, game, closeStale, args) {
    const open = await ctx.rpc('get_open_round', { p_user: ctx.userId, p_game: game })
    if (open) await closeStale(ctx, open.round, open.secret)
    const opened = await ctx.rpc('open_round', { p_user: ctx.userId, p_game: game, ...args })
    return { ...opened, round: publicRound(opened.round), secret: undefined }
}

export async function currentRound(ctx, game) {
    const open = await ctx.rpc('get_open_round', { p_user: ctx.userId, p_game: game })
    if (!open) return { round: null }
    if (game === 'crash') return crashState(ctx, open.round, open.secret)
    return { round: publicRound(open.round) }
}

// Mines ------------------------------------------------------------------------------------------

function minesPayout(round) {
    const hits = round.state.revealed?.length ?? 0
    const multiplier = minesMultiplier(round.params.mines, hits)
    const bp = toBp(multiplier)
    return { bp, payout: hits === 0 ? round.stake : applyMultiplier(round.stake, bp), multiplier }
}

const minesCashout = (ctx, round, secret) => {
    const { bp, payout, multiplier } = minesPayout(round)
    return settle(ctx, round, payout, bp, { mines: secret.mines, revealed: round.state.revealed, multiplier, cashedOut: true })
}

export async function minesStart(ctx, body) {
    const stake = stakeCents(body.stake)
    const mines = int(body.mines, MINES_MIN, MINES_MAX, 'invalid_mines')
    const key = idempotencyKey(body.idempotencyKey)
    const tiles = Array.from({ length: GRID_SIZE }, (_, i) => i)
    for (let i = 0; i < mines; i += 1) {
        const j = i + ctx.rng.int(0, GRID_SIZE - i)
        ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
    }
    return openFresh(ctx, 'mines', minesCashout, {
        p_stake: stake, p_params: { mines }, p_state: { revealed: [] }, p_secret: { mines: tiles.slice(0, mines).sort((a, b) => a - b) }, p_idem: key,
    })
}

export async function minesReveal(ctx, body) {
    const { round, secret } = await loadOpen(ctx, body.roundId, 'mines')
    if (round.status !== 'open') return { round: publicRound(round), outcome: 'settled' }
    const tile = int(body.tile, 0, GRID_SIZE - 1, 'invalid_tile')
    const revealed = round.state.revealed ?? []
    if (revealed.includes(tile)) fail('tile_revealed', 409)
    if (secret.mines.includes(tile)) {
        const settled = await settle(ctx, round, 0, 0, { mines: secret.mines, revealed, hit: tile })
        return { ...settled, outcome: 'mine' }
    }
    const next = { ...round, state: { revealed: [...revealed, tile] } }
    if (next.state.revealed.length === GRID_SIZE - round.params.mines) {
        const settled = await minesCashout(ctx, { ...next, step: round.step }, secret)
        return { ...settled, outcome: 'cleared' }
    }
    const stepped = await ctx.rpc('round_step', { p_user: ctx.userId, p_round: round.id, p_expected_step: round.step, p_state: next.state })
    return { round: publicRound(stepped.round), outcome: 'gem', multiplier: minesPayout(stepped.round).multiplier }
}

export async function minesCashoutRoute(ctx, body) {
    const { round, secret } = await loadOpen(ctx, body.roundId, 'mines')
    if (round.status !== 'open') return { round: publicRound(round), outcome: 'settled' }
    if (!(round.state.revealed?.length > 0)) fail('nothing_to_cash_out', 409)
    return { ...(await minesCashout(ctx, round, secret)), outcome: 'cashed' }
}

// Crash ------------------------------------------------------------------------------------------

const elapsedSeconds = (ctx, round) => (ctx.now() - Date.parse(round.createdAt)) / 1000

// Decides an open crash round at the current server time; settles it when it has ended.
async function crashState(ctx, round, secret, claimed = null) {
    const crashPoint = secret.crashPoint
    const auto = round.params.autoCashout ?? null
    const now = crashMultiplierAt(elapsedSeconds(ctx, round))
    if (auto !== null && auto < crashPoint && now >= auto) {
        const bp = toBp(auto)
        const settled = await settle(ctx, round, applyMultiplier(round.stake, bp), bp, { crashPoint, cashedOutAt: auto, auto: true })
        return { ...settled, state: 'cashed' }
    }
    if (now >= crashPoint) {
        const settled = await settle(ctx, round, 0, 0, { crashPoint })
        return { ...settled, state: 'crashed' }
    }
    if (claimed !== null) {
        const at = Math.min(claimed, now)
        const bp = toBp(at)
        const settled = await settle(ctx, round, applyMultiplier(round.stake, bp), bp, { crashPoint, cashedOutAt: at })
        return { ...settled, state: 'cashed' }
    }
    return { round: publicRound(round), state: 'running', multiplier: now, elapsedMs: Math.round(elapsedSeconds(ctx, round) * 1000) }
}

const crashCloseStale = (ctx, round, secret) => crashState(ctx, round, secret, crashMultiplierAt(elapsedSeconds(ctx, round)))

export async function crashStart(ctx, body) {
    const stake = stakeCents(body.stake)
    let autoCashout = null
    if (body.autoCashout !== undefined && body.autoCashout !== null && body.autoCashout !== '') {
        autoCashout = target2(body.autoCashout, 'limbo')
        if (autoCashout > 1000) fail('invalid_target')
    }
    const key = idempotencyKey(body.idempotencyKey)
    return openFresh(ctx, 'crash', crashCloseStale, {
        p_stake: stake, p_params: { autoCashout }, p_state: {}, p_secret: { crashPoint: crashPointFromFloat(ctx.rng.float()) }, p_idem: key,
    })
}

export async function crashCashout(ctx, body) {
    const { round, secret } = await loadOpen(ctx, body.roundId, 'crash')
    if (round.status !== 'open') return { round: publicRound(round), state: round.result.cashedOutAt ? 'cashed' : 'crashed' }
    let claimed = crashMultiplierAt(elapsedSeconds(ctx, round))
    if (body.multiplier !== undefined) {
        const value = Number(body.multiplier)
        if (!Number.isFinite(value) || value < 1 || value > 1000) fail('invalid_multiplier')
        // Cut to 0.01x without losing a cent to binary rounding (1.15 * 100 is 114.999…, which
        // Math.floor made 1.14x); the same epsilon as toBp. The server clock still caps the claim.
        claimed = Math.floor(value * 100 + 1e-7) / 100
    }
    return crashState(ctx, round, secret, claimed)
}

// Long poll: answers when the round ends (crash or automatic cash out) or after 10 s.
export async function crashWatch(ctx, body) {
    const deadline = ctx.now() + WATCH_MAX_MS
    for (;;) {
        const { round, secret } = await loadOpen(ctx, body.roundId, 'crash')
        if (round.status !== 'open') return { round: publicRound(round), state: round.result.cashedOutAt ? 'cashed' : 'crashed' }
        const state = await crashState(ctx, round, secret)
        if (state.state !== 'running') return state
        const auto = round.params.autoCashout
        const nextEvent = Math.min(crashSecondsTo(secret.crashPoint), auto && auto < secret.crashPoint ? crashSecondsTo(auto) : Infinity)
        const wait = Math.min(nextEvent * 1000 - state.elapsedMs + 20, deadline - ctx.now())
        if (wait <= 0) return state
        await ctx.sleep(wait)
    }
}

// Dino -------------------------------------------------------------------------------------------

const dinoCashout = (ctx, round) => {
    const cleared = round.state.cleared ?? 0
    const multiplier = dinoMultiplier(round.params.difficulty, cleared)
    const bp = toBp(multiplier)
    return settle(ctx, round, cleared === 0 ? round.stake : applyMultiplier(round.stake, bp), bp, { cleared, multiplier, cashedOut: true })
}

export async function dinoStart(ctx, body) {
    const stake = stakeCents(body.stake)
    const difficulty = oneOf(body.difficulty, DINO_DIFFICULTIES, 'invalid_difficulty')
    const key = idempotencyKey(body.idempotencyKey)
    return openFresh(ctx, 'dino', dinoCashout, { p_stake: stake, p_params: { difficulty }, p_state: { cleared: 0 }, p_secret: {}, p_idem: key })
}

export async function dinoJump(ctx, body) {
    const { round } = await loadOpen(ctx, body.roundId, 'dino')
    if (round.status !== 'open') return { round: publicRound(round), outcome: 'settled' }
    const cleared = round.state.cleared ?? 0
    // A retried request (lost response) carries the step it saw: it gets the current state, not a new roll.
    if (body.step !== undefined && body.step !== round.step) return { round: publicRound(round), outcome: 'cleared', cleared, multiplier: dinoMultiplier(round.params.difficulty, cleared), stale: true }
    if (cleared >= DINO_MAX_JUMPS) fail('max_jumps', 409)
    const roll = ctx.rng.float()
    if (roll >= DINO_SURVIVAL[round.params.difficulty]) {
        const settled = await settle(ctx, round, 0, 0, { cleared, crashedAt: cleared + 1, roll })
        return { ...settled, outcome: 'crashed' }
    }
    const stepped = await ctx.rpc('round_step', { p_user: ctx.userId, p_round: round.id, p_expected_step: round.step, p_state: { cleared: cleared + 1 } })
    return { round: publicRound(stepped.round), outcome: 'cleared', cleared: cleared + 1, multiplier: dinoMultiplier(round.params.difficulty, cleared + 1) }
}

export async function dinoCashoutRoute(ctx, body) {
    const { round } = await loadOpen(ctx, body.roundId, 'dino')
    if (round.status !== 'open') return { round: publicRound(round), outcome: 'settled' }
    return { ...(await dinoCashout(ctx, round)), outcome: 'cashed' }
}

export { publicRound }
