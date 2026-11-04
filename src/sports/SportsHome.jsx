import { useSearchParams } from 'react-router-dom'
import { Search, Star, X } from 'lucide-react'
import { t } from '../i18n'
import { useFavoriteLeagues } from '../lib/storage'
import { fetchMatches } from './api'
import { DataNotice, LeagueStar, MatchRow } from './components'
import { brtDate, dayLabel, shiftDate } from './format'
import { usePolling } from './usePolling'

const TABS = ['live', 'upcoming', 'results']
const FAVORITES = 'fav'
const MAX_HIGHLIGHTS = 4

const KEEP = {
    live: () => true,
    upcoming: (m) => m.status.phase === 'scheduled',
    results: (m) => m.status.phase === 'finished' || m.status.phase === 'cancelled',
}

// Accent- and case-insensitive team search ("sao paulo" finds "São Paulo").
const fold = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const matchesTeam = (match, query) => fold(`${match.home.name} ${match.away.name}`).includes(fold(query))

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
    const favorites = useFavoriteLeagues()
    const today = brtDate()
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'upcoming'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : today
    const leagueFilter = params.get('league')
    const query = (params.get('q') ?? '').slice(0, 60)

    const live = usePolling((signal) => fetchMatches({ view: 'live' }, signal), 30_000, [])
    const byDate = usePolling(
        (signal) => (tab === 'live' ? Promise.resolve(null) : fetchMatches({ view: 'date', date }, signal)),
        tab === 'live' ? 0 : date === today ? 60_000 : tab === 'results' && date < today ? 0 : 300_000,
        [tab, date],
    )
    const current = tab === 'live' ? live : byDate
    const matches = (current.data?.matches ?? []).filter(KEEP[tab])
    // Favourite leagues first, then the provider's order.
    const leagues = groupByLeague(matches).map((g) => g.league).sort((a, b) => favorites.has(b.id) - favorites.has(a.id))
    const byLeague = leagueFilter === FAVORITES ? matches.filter((m) => favorites.has(m.league.id))
        : leagueFilter ? matches.filter((m) => m.league.id === leagueFilter) : matches
    const visible = query ? byLeague.filter((m) => matchesTeam(m, query)) : byLeague
    const groups = groupByLeague(visible).sort((a, b) => favorites.has(b.league.id) - favorites.has(a.league.id))
    const days = tab === 'results' ? [0, -1, -2, -3, -4, -5, -6] : [0, 1, 2, 3, 4, 5, 6]

    // Highlights: live first, then the next kick-offs, from favourite or featured leagues. Default view only.
    const showHighlights = !query && !leagueFilter && tab === 'upcoming' && date === today
    const highlighted = (m) => favorites.has(m.league.id) || m.league.featured
    const highlights = showHighlights
        ? [
            ...(live.data?.matches ?? []).filter((m) => m.status.phase === 'live' && highlighted(m)),
            ...matches.filter(highlighted).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
        ].slice(0, MAX_HIGHLIGHTS)
        : []

    const update = (changes) => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
        }
        setParams(next, { replace: true })
    }

    const emptyText = query ? t('sports.noTeamResults', { query })
        : leagueFilter === FAVORITES ? t('sports.noFavoriteMatches') : t(`sports.empty.${tab}`)

    return (
        <div className="sp-page">
            <header className="sp-page__head">
                <h1>{t('sports.title')}</h1>
                <span className="sp-page__updated" aria-live="polite">
                    {current.loading && !current.data ? t('common.loading') : current.data ? t('sports.updatedAt', { time: new Date(current.data.meta.updatedAt).toLocaleTimeString('pt-BR') }) : ''}
                </span>
            </header>

            <DataNotice meta={(current.data ?? live.data)?.meta} />

            <div className="sp-toolbar">
                <div className="sp-tabs" role="tablist" aria-label={t('sports.tabsLabel')}>
                    {TABS.map((id) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => update({ tab: id === 'upcoming' ? null : id, date: null })}>
                            {id === 'live' && <span className="sp-live-dot" aria-hidden="true" />}
                            {t(`sports.tabs.${id}`)}
                            {id === 'live' && live.data && <span className="sp-count">{live.data.matches.length}</span>}
                        </button>
                    ))}
                </div>
                <label className="sp-search">
                    <Search size={16} aria-hidden="true" />
                    <span className="visually-hidden">{t('sports.searchTeamLabel')}</span>
                    <input type="search" value={query} placeholder={t('sports.searchTeam')} onChange={(event) => update({ q: event.target.value })} />
                    {query && (
                        <button type="button" className="sp-search__clear" aria-label={t('sports.clearSearch')} onClick={() => update({ q: null })}>
                            <X size={14} aria-hidden="true" />
                        </button>
                    )}
                </label>
            </div>

            {tab !== 'live' && (
                <div className="sp-chips" role="group" aria-label={t('sports.dateLabel')}>
                    {days.map((offset) => {
                        const value = shiftDate(today, offset)
                        return (
                            <button key={value} type="button" className={value === date ? 'is-active' : ''} aria-pressed={value === date} onClick={() => update({ date: value === today ? null : value })}>
                                {dayLabel(value, today)}
                            </button>
                        )
                    })}
                </div>
            )}

            {(leagues.length > 1 || leagueFilter || favorites.items.length > 0) && (
                <div className="sp-chips sp-chips--leagues" role="group" aria-label={t('sports.leaguesLabel')}>
                    <button type="button" className={!leagueFilter ? 'is-active' : ''} aria-pressed={!leagueFilter} onClick={() => update({ league: null })}>{t('sports.allLeagues')}</button>
                    {favorites.items.length > 0 && (
                        <button type="button" className={leagueFilter === FAVORITES ? 'is-active' : ''} aria-pressed={leagueFilter === FAVORITES} onClick={() => update({ league: FAVORITES })}>
                            <Star size={14} aria-hidden="true" fill="currentColor" />{t('sports.favoriteLeagues')}
                        </button>
                    )}
                    {leagues.map((league) => (
                        <button key={league.id} type="button" className={leagueFilter === league.id ? 'is-active' : ''} aria-pressed={leagueFilter === league.id} onClick={() => update({ league: league.id })}>
                            {league.logo && <img src={league.logo} alt="" width="16" height="16" loading="lazy" />}
                            {league.name}
                        </button>
                    ))}
                </div>
            )}

            {highlights.length > 0 && (
                <section className="sp-league sp-highlights" aria-labelledby="sp-highlights">
                    <h2 className="sp-league__title" id="sp-highlights">
                        <span>{t('sports.highlights')}</span>
                        <small>{t('sports.highlightsHint')}</small>
                    </h2>
                    <div className="sp-league__list">
                        {highlights.map((match) => <MatchRow key={`h-${match.id}`} match={match} />)}
                    </div>
                </section>
            )}

            {current.error && !current.data && (
                <div className="sp-state sp-state--error" role="alert">
                    <p>{current.error.message}</p>
                    <button type="button" onClick={current.reload}>{t('common.retry')}</button>
                </div>
            )}
            {current.loading && !current.data && <div className="sp-state">{t('sports.loadingMatches')}</div>}
            {current.data && !visible.length && <div className="sp-state">{emptyText}</div>}

            {groups.map(({ league, matches: games }) => (
                <section key={league.id} className="sp-league">
                    <h2 className="sp-league__title">
                        {league.logo && <img src={league.logo} alt="" width="18" height="18" loading="lazy" />}
                        <span>{league.name}</span>
                        {league.country && <small>{league.country}</small>}
                        <LeagueStar league={league} />
                    </h2>
                    <div className="sp-league__list">
                        {games.map((match) => <MatchRow key={match.id} match={match} />)}
                    </div>
                </section>
            ))}
        </div>
    )
}
