// Catalog categories (ids are stable; labels live in src/i18n/pt-BR/casino.js).
export const CATEGORIES = ['slots', 'table', 'live', 'crash', 'mines', 'plinko', 'roulette', 'blackjack', 'baccarat', 'instant', 'other']

// Provider and aggregator feeds name types differently; unknown values fall back to "other".
const SYNONYMS = {
    slot: 'slots', slots: 'slots', 'video slot': 'slots', 'video slots': 'slots', videoslots: 'slots',
    table: 'table', 'table game': 'table', 'table games': 'table', tablegames: 'table', 'card games': 'table', poker: 'table',
    live: 'live', 'live casino': 'live', 'live dealer': 'live', 'live games': 'live', livecasino: 'live', 'game show': 'live', 'game shows': 'live',
    crash: 'crash', 'crash games': 'crash',
    mines: 'mines', minesweeper: 'mines',
    plinko: 'plinko',
    roulette: 'roulette', 'live roulette': 'roulette',
    blackjack: 'blackjack', 'live blackjack': 'blackjack',
    baccarat: 'baccarat', 'live baccarat': 'baccarat',
    instant: 'instant', 'instant win': 'instant', 'instant games': 'instant', 'instant-win': 'instant', scratch: 'instant', 'scratch cards': 'instant', dice: 'instant', keno: 'instant', bingo: 'instant',
}

export const isCategory = (value) => CATEGORIES.includes(value)

export function mapCategory(raw) {
    if (typeof raw !== 'string') return 'other'
    const key = raw.trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ')
    return SYNONYMS[key] ?? (isCategory(key) ? key : 'other')
}
