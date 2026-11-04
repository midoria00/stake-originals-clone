import { useSearchParams } from 'react-router-dom'
import { fetchMatches } from './api'
import { DataNotice, MatchRow } from './components'
import { brtDate, dayLabel, shiftDate } from './format'
import { usePolling } from './usePolling'

const TABS = [
    { id: 'live', label: 'Ao vivo' },
    { id: 'upcoming', label: 'Próximas' },
    { id: 'results', label: 'Resultados' },
]

const KEEP = {
    live: () => true,
    upcoming: (m) => m.status.phase === 'scheduled',
    results: (m) => m.status.phase === 'finished' || m.status.phase === 'cancelled',
}

const EMPTY = {
    live: 'Nenhuma partida ao vivo agora.',
    upcoming: 'Nenhuma partida programada para esta data.',
    results: 'Nenhum resultado para esta data.',
}

function groupByLeague(matches) {
    const groups = new Map()
    for (const match of matches) {
        if (!groups.has(match.league.id)) groups.set(match.league.id, { league: match.league, matches: [] })
        groups.get(match.league.id).matches.push(match)
    }
    return [...groups.values()]
}

export default function SportsHome() {
    const [params, setParams] = useSearchParams()
    const today = brtDate()
    const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'upcoming'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : today
    const leagueFilter = params.get('league')

    const live = usePolling((signal) => fetchMatches({ view: 'live' }, signal), 30_000, [])
    const byDate = usePolling(
        (signal) => (tab === 'live' ? Promise.resolve(null) : fetchMatches({ view: 'date', date }, signal)),
        tab === 'live' ? 0 : date === today ? 60_000 : tab === 'results' && date < today ? 0 : 300_000,
        [tab, date],
    )
    const query = tab === 'live' ? live : byDate
    const matches = (query.data?.matches ?? []).filter(KEEP[tab])
    const leagues = groupByLeague(matches).map((g) => g.league)
    const visible = leagueFilter ? matches.filter((m) => m.league.id === leagueFilter) : matches
    const days = tab === 'results' ? [0, -1, -2, -3, -4, -5, -6] : [0, 1, 2, 3, 4, 5, 6]

    const update = (changes) => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key)
            else next.set(key, value)
        }
        setParams(next, { replace: true })
    }

    return (
        <div className="sp-page">
            <header className="sp-page__head">
                <h1>Futebol</h1>
                <span className="sp-page__updated" aria-live="polite">
                    {query.loading && !query.data ? 'Carregando…' : query.data ? `Atualizado ${new Date(query.data.meta.updatedAt).toLocaleTimeString('pt-BR')}` : ''}
                </span>
            </header>

            <DataNotice meta={(query.data ?? live.data)?.meta} />

            <div className="sp-tabs" role="tablist" aria-label="Partidas">
                {TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => update({ tab: t.id, date: null })}>
                        {t.id === 'live' && <span className="sp-live-dot" aria-hidden="true" />}
                        {t.label}
                        {t.id === 'live' && live.data && <span className="sp-count">{live.data.matches.length}</span>}
                    </button>
                ))}
            </div>

            {tab !== 'live' && (
                <div className="sp-chips" aria-label="Data">
                    {days.map((offset) => {
                        const value = shiftDate(today, offset)
                        return (
                            <button key={value} type="button" className={value === date ? 'is-active' : ''} onClick={() => update({ date: value === today ? null : value })}>
                                {dayLabel(value, today)}
                            </button>
                        )
                    })}
                </div>
            )}

            {(leagues.length > 1 || leagueFilter) && (
                <div className="sp-chips sp-chips--leagues" aria-label="Campeonatos">
                    <button type="button" className={!leagueFilter ? 'is-active' : ''} onClick={() => update({ league: null })}>Todos</button>
                    {leagues.map((league) => (
                        <button key={league.id} type="button" className={leagueFilter === league.id ? 'is-active' : ''} onClick={() => update({ league: league.id })}>
                            {league.logo && <img src={league.logo} alt="" width="16" height="16" loading="lazy" />}
                            {league.name}
                        </button>
                    ))}
                </div>
            )}

            {query.error && !query.data && (
                <div className="sp-state sp-state--error" role="alert">
                    <p>{query.error.message}</p>
                    <button type="button" onClick={query.reload}>Tentar de novo</button>
                </div>
            )}
            {query.loading && !query.data && <div className="sp-state">Carregando partidas…</div>}
            {query.data && !visible.length && <div className="sp-state">{EMPTY[tab]}</div>}

            {groupByLeague(visible).map(({ league, matches: games }) => (
                <section key={league.id} className="sp-league">
                    <h2 className="sp-league__title">
                        {league.logo && <img src={league.logo} alt="" width="18" height="18" loading="lazy" />}
                        <span>{league.name}</span>
                        {league.country && <small>{league.country}</small>}
                    </h2>
                    <div className="sp-league__list">
                        {games.map((match) => <MatchRow key={match.id} match={match} />)}
                    </div>
                </section>
            ))}
        </div>
    )
}
