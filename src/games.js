// 123bet Originals. Texts live in i18n (`games.<id>.summary`); `addedAt` (date the game entered this repo) drives "Adicionados recentemente".
// No RTP badges: the inherited figures did not match the game code, and the help page explains each rule.
export const GAMES = [
    { id: 'crash', name: 'Crash', navLabel: 'Crash', path: '/crash', icon: 'crash', image: '/images/crash.avif', addedAt: '2026-02-28' },
    { id: 'plinko', name: 'Plinko', navLabel: 'Plinko', path: '/plinko', icon: 'plinko', image: '/images/plinko.avif', addedAt: '2026-02-28' },
    { id: 'mines', name: 'Mines', navLabel: 'Mines', path: '/mines', icon: 'mines', image: '/images/mines.avif', addedAt: '2026-02-28' },
    { id: 'dino', name: 'Dino', navLabel: 'Dino Run', path: '/dino', icon: 'dino', image: '/images/dino.avif', addedAt: '2026-02-28' },
    { id: 'dice', name: 'Dice', navLabel: 'Dice', path: '/dice', icon: 'dice', image: '/images/dice.svg', addedAt: '2026-11-04' },
    { id: 'limbo', name: 'Limbo', navLabel: 'Limbo', path: '/limbo', icon: 'limbo', image: '/images/limbo.svg', addedAt: '2026-11-04' },
]

export const getGame = (id) => GAMES.find((game) => game.id === id) ?? null

export function gameFromPath(pathname) {
    return GAMES.find((game) => pathname === game.path || pathname.startsWith(`${game.path}/`)) ?? null
}

export function isGamePath(pathname) {
    return gameFromPath(pathname) !== null
}
