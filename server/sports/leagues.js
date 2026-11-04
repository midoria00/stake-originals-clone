// API-Football league ids. Demo mode reuses them, so filters and sidebar links work in both modes.
export const FEATURED_LEAGUES = [
    { id: 71, name: 'Brasileirão Série A', country: 'Brasil' },
    { id: 13, name: 'Copa Libertadores', country: 'América do Sul' },
    { id: 2, name: 'Champions League', country: 'Europa' },
    { id: 39, name: 'Premier League', country: 'Inglaterra' },
    { id: 140, name: 'La Liga', country: 'Espanha' },
    { id: 73, name: 'Copa do Brasil', country: 'Brasil' },
    { id: 72, name: 'Brasileirão Série B', country: 'Brasil' },
    { id: 11, name: 'Copa Sul-Americana', country: 'América do Sul' },
    { id: 3, name: 'Europa League', country: 'Europa' },
    { id: 135, name: 'Serie A', country: 'Itália' },
    { id: 78, name: 'Bundesliga', country: 'Alemanha' },
    { id: 61, name: 'Ligue 1', country: 'França' },
]

const BY_ID = new Map(FEATURED_LEAGUES.map((league, index) => [league.id, { ...league, order: index }]))

export function describeLeague(id, fallback = {}) {
    const featured = BY_ID.get(Number(id))
    return {
        id: String(id),
        name: featured?.name ?? fallback.name ?? 'Campeonato',
        country: featured?.country ?? fallback.country ?? null,
        logo: fallback.logo ?? null,
        flag: fallback.flag ?? null,
        round: fallback.round ?? null,
        featured: Boolean(featured),
        order: featured?.order ?? 1000,
    }
}
