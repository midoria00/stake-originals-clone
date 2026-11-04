// Dino rules shared by the game screen and the server. Pure functions.
import { DINO_SURVIVAL } from '../../components/DinoGame/difficulties.js'

export { DINO_SURVIVAL }
export const DINO_DIFFICULTIES = Object.keys(DINO_SURVIVAL)
export const DINO_MAX_JUMPS = 50

// 99% RTP: 0.99 / P(surviving every jump), floored to 2 decimals.
export function dinoMultiplier(difficulty, cleared) {
    if (cleared <= 0) return 1.0
    const probability = Math.pow(DINO_SURVIVAL[difficulty], cleared)
    return parseFloat((Math.floor((0.99 / probability) * 100) / 100).toFixed(2))
}
