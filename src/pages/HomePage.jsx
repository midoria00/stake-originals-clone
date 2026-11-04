import { Link } from 'react-router-dom'
import { ArrowRight, Coins as CoinsIcon, Lock, ShieldCheck, Trophy } from 'lucide-react'
import { PROVIDERS } from '../../server/casino/providers.js'
import { useProviderStatuses } from '../casino/api'
import { ProviderGrid, TotalsLine } from '../casino/components'
import { GameGrid } from '../components/GameCard'
import { FootballIcon } from '../components/icons'
import { useWallet } from '../context/WalletContext'
import { GAMES, getGame } from '../games'
import { t } from '../i18n'
import { formatNumber } from '../i18n/format'
import { useFavoriteGames, useRecentGames } from '../lib/storage'
import { fetchMatches } from '../sports/api'
import { MatchRow } from '../sports/components'
import { brtDate } from '../sports/format'
import { usePolling } from '../sports/usePolling'
import '../sports/sports.css'
import '../styles/home.css'

const MAX_MATCHES = 6
const TOP_PROVIDERS = 12
const byKickoff = (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)

// Registry order puts PG Soft, Pragmatic Play and Hacksaw first; statuses come from the server
// and never claim an integration that does not exist.
function TopProviders() {
    const statuses = useProviderStatuses()
    const rows = statuses.data ? new Map(statuses.data.providers.map((row) => [row.id, row])) : null
    return (
        <Section id="home-providers" title={t('casino.topProviders')} hint={t('casino.topProvidersHint')} link={{ to: '/cassino/provedores', label: t('casino.seeAllProviders') }}>
            <ProviderGrid providers={PROVIDERS.slice(0, TOP_PROVIDERS)} rows={rows} />
            <TotalsLine state={statuses} />
        </Section>
    )
}

function Section({ id, title, hint, link, children }) {
    return (
        <section className="home-section" aria-labelledby={id}>
            <div className="home-section__head">
                <div>
                    <h2 id={id}>{title}</h2>
                    {hint && <p>{hint}</p>}
                </div>
                {link && <Link className="home-section__link" to={link.to}>{link.label}<ArrowRight size={14} aria-hidden="true" /></Link>}
            </div>
            {children}
        </section>
    )
}

const Hint = ({ children }) => <p className="home-empty">{children}</p>

function MatchList({ matches, empty, query }) {
    if (query.error && !query.data) return <Hint>{t('home.sportsUnavailable')}</Hint>
    if (!query.data) return <div className="home-matches home-matches--loading" aria-busy="true"><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line" /></div>
    if (!matches.length) return <Hint>{empty}</Hint>
    return (
        <div className="home-matches">
            {matches.slice(0, MAX_MATCHES).map((match) => <MatchRow key={match.id} match={match} />)}
        </div>
    )
}

function useHomeSports() {
    const today = brtDate()
    const live = usePolling((signal) => fetchMatches({ view: 'live' }, signal), 60_000, [])
    const day = usePolling((signal) => fetchMatches({ view: 'date', date: today }, signal), 120_000, [today])
    const matches = day.data?.matches ?? []
    const leagues = new Map()
    for (const match of matches) {
        const entry = leagues.get(match.league.id) ?? { league: match.league, count: 0 }
        entry.count += 1
        leagues.set(match.league.id, entry)
    }
    return {
        live,
        day,
        simulated: Boolean((live.data ?? day.data)?.meta?.simulated),
        liveMatches: live.data?.matches ?? [],
        upcoming: matches.filter((m) => m.status.phase === 'scheduled').sort(byKickoff),
        results: matches.filter((m) => m.status.phase === 'finished').sort(byKickoff).reverse(),
        leagues: [...leagues.values()].sort((a, b) => (a.league.order ?? 1000) - (b.league.order ?? 1000) || b.count - a.count).slice(0, 10),
    }
}

export default function HomePage() {
    const { stats } = useWallet()
    const favorites = useFavoriteGames()
    const recent = useRecentGames()
    const sports = useHomeSports()

    const popular = Object.entries(stats.bySource)
        .filter(([source, s]) => getGame(source) && s.bets > 0)
        .sort((a, b) => b[1].bets - a[1].bets)
        .map(([source, s]) => ({ game: getGame(source), bets: s.bets }))
    const playCount = new Map(popular.map((item) => [item.game.id, item.bets]))
    const recentlyAdded = [...GAMES].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 4)
    const favoriteGames = favorites.ids.map(getGame).filter(Boolean)
    const recentGames = recent.items.map((item) => getGame(item.id)).filter(Boolean)
    const demoHint = sports.simulated ? t('home.infoDataDemo') : undefined
    const sportsMeta = (sports.live.data ?? sports.day.data)?.meta
    const dataText = sportsMeta ? (sportsMeta.simulated ? t('home.infoDataDemo') : t('home.infoDataReal', { source: sportsMeta.source }))
        : sports.live.error && sports.day.error ? t('home.sportsUnavailable') : t('common.loading')

    return (
        <div className="page home">
            <div className="page__inner">
                <section className="home-hero" aria-labelledby="home-title">
                    <p className="home-hero__eyebrow">{t('home.heroEyebrow')}</p>
                    <h1 id="home-title">{t('home.heroTitle')}</h1>
                    <p className="home-hero__body">{t('home.heroBody')}</p>
                    <div className="home-hero__actions">
                        <Link className="button button--primary" to="/cassino">{t('home.heroCasino')}</Link>
                        <Link className="button button--ghost" to="/sports"><FootballIcon size={16} />{t('home.heroSports')}</Link>
                    </div>
                </section>

                <Section id="home-originals" title={t('home.originals')} hint={t('home.originalsHint')} link={{ to: '/cassino', label: t('common.seeAll') }}>
                    <GameGrid games={GAMES} />
                </Section>

                <TopProviders />

                <Section id="home-live" title={t('home.liveFootball')} hint={demoHint} link={{ to: '/sports?tab=live', label: t('common.seeAll') }}>
                    <MatchList query={sports.live} matches={sports.liveMatches} empty={t('home.liveEmpty')} />
                </Section>

                <Section id="home-upcoming" title={t('home.upcoming')} hint={demoHint} link={{ to: '/sports', label: t('common.seeAll') }}>
                    <MatchList query={sports.day} matches={sports.upcoming} empty={t('home.upcomingEmpty')} />
                </Section>

                <Section id="home-leagues" title={t('home.leagues')}>
                    {sports.day.error && !sports.day.data ? <Hint>{t('home.sportsUnavailable')}</Hint>
                        : !sports.day.data ? <Hint>{t('common.loading')}</Hint>
                            : sports.leagues.length === 0 ? <Hint>{t('home.leaguesEmpty')}</Hint> : (
                                <ul className="home-leagues">
                                    {sports.leagues.map(({ league, count }) => (
                                        <li key={league.id}>
                                            <Link to={`/sports?league=${encodeURIComponent(league.id)}`}>
                                                {league.logo ? <img src={league.logo} alt="" width="20" height="20" loading="lazy" /> : <Trophy size={18} aria-hidden="true" />}
                                                <span>{league.name}</span>
                                                <small>{formatNumber(count)}</small>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Section>

                <Section id="home-popular" title={t('home.popular')} hint={t('home.popularHint')}>
                    {popular.length
                        ? <GameGrid compact games={popular.map((item) => item.game)} metaFor={(game) => t('wallet.betsCount') + ': ' + formatNumber(playCount.get(game.id))} />
                        : <Hint>{t('home.popularEmpty')}</Hint>}
                </Section>

                <Section id="home-new" title={t('home.recentlyAdded')}>
                    <GameGrid compact games={recentlyAdded} />
                </Section>

                <Section id="home-favorites" title={t('home.favorites')} link={favoriteGames.length ? { to: '/favoritos', label: t('common.seeAll') } : undefined}>
                    {favoriteGames.length ? <GameGrid compact games={favoriteGames.slice(0, 6)} /> : <Hint>{t('home.favoritesEmpty')}</Hint>}
                </Section>

                <Section id="home-recent" title={t('home.recent')} link={recentGames.length ? { to: '/recentes', label: t('common.seeAll') } : undefined}>
                    {recentGames.length ? <GameGrid compact games={recentGames.slice(0, 6)} /> : <Hint>{t('home.recentEmpty')}</Hint>}
                </Section>

                <Section id="home-results" title={t('home.results')} hint={demoHint} link={{ to: '/sports?tab=results', label: t('common.seeAll') }}>
                    <MatchList query={sports.day} matches={sports.results} empty={t('home.resultsEmpty')} />
                </Section>

                <Section id="home-platform" title={t('home.platform')}>
                    <div className="home-info">
                        <Link to="/carteira" className="home-info__card">
                            <CoinsIcon size={20} aria-hidden="true" />
                            <strong>{t('home.infoCoinsTitle')}</strong>
                            <span>{t('home.infoCoinsBody')}</span>
                        </Link>
                        <Link to="/verificar" className="home-info__card">
                            <ShieldCheck size={20} aria-hidden="true" />
                            <strong>{t('home.infoFairTitle')}</strong>
                            <span>{t('home.infoFairBody')}</span>
                        </Link>
                        <Link to="/sobre" className="home-info__card">
                            <FootballIcon size={20} />
                            <strong>{t('home.infoDataTitle')}</strong>
                            <span>{dataText}</span>
                        </Link>
                        <Link to="/privacidade" className="home-info__card">
                            <Lock size={20} aria-hidden="true" />
                            <strong>{t('home.infoPrivacyTitle')}</strong>
                            <span>{t('home.infoPrivacyBody')}</span>
                        </Link>
                    </div>
                </Section>
            </div>
        </div>
    )
}
