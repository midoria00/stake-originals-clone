// Mines rules shared by the game screen and the server. Pure functions.
export const GRID_SIZE = 25
export const MINES_MIN = 1
export const MINES_MAX = 24
const HOUSE_EDGE = 0.99 // 1% edge

export function minesMultiplier(mines, hits) {
    if (hits === 0) return 1.0
    let mult = 1
    for (let i = 0; i < hits; i++) {
        mult *= (GRID_SIZE - i) / (GRID_SIZE - mines - i)
    }
    return mult * HOUSE_EDGE
}
