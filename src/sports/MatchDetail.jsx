import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { t } from '../i18n'
import { fetchMatch } from './api'
import { DataNotice, LeagueStar, OddButton, TeamCrest } from './components'
import { clockText, kickoffDateTime, marketLabel, selectionLabel, statLabel } from './format'
import { usePolling } from './usePolling'

const REFRESH_BY_PHASE = { live: 20_000, scheduled: 60_000 }

function groupMarkets(markets) {
    const groups = new Map()
    for (const market of markets) {
        if (!groups.has(market.key)) groups.set(market.key, { key: market.key, label: marketLabel(market), source: market.source, markets: [] })
        groups.get(market.key).markets.push(market)
    }
    return [...groups.values()]
}

function Markets({ match }) {
    const [only, setOnly] = useState(null)
    if (!match.markets.length) {
        const over = match.status.phase === 'finished' || match.status.phase === 'cancelled'
        return <div className="sp-state">{t(over ? 'sports.match.marketsClosed' : 'sports.match.noOdds')}</div>
    }
    const groups = groupMarkets(match.markets)
    const shown = only ? groups.filter((group) => group.key === only) : groups
    return (
        <>
            {groups.length > 1 && (
                <div className="sp-chips sp-chips--markets" role="group" aria-label={t('sports.match.marketsLabel')}>
                    <button type="button" className={!only ? 'is-active' : ''} aria-pressed={!only} onClick={() => setOnly(null)}>{t('sports.match.allMarkets')}</button>
                    {groups.map((group) => (
                        <button key={group.key} type="button" className={only === group.key ? 'is-active' : ''} aria-pressed={only === group.key} onClick={() => setOnly(group.key)}>
                            {group.label}
                        </button>
                    ))}
                </div>
            )}
            {shown.map((group) => (
                <section key={group.key} className="sp-market">
                    <h3>{group.label}{group.source && <small>{group.source}</small>}</h3>
                    {group.markets.map((market) => (
                        <div key={`${market.key}-${market.line}`} className={`sp-market__line sp-market__line--${market.selections.length}`}>
                            {market.selections.map((selection) => {
                                const label = selectionLabel(market.key, selection, match)
                                return <OddButton key={selection.id} match={match} market={market} selection={selection} label={label} ariaLabel={`${group.label}, ${label}`} />
                            })}
                        </div>
                    ))}
                </section>
            ))}
        </>
    )
}

function Stats({ match }) {
    if (!match.stats.length) return <div className="sp-state">{t('sports.match.noStats')}</div>
    return (
        <ul className="sp-stats">
            {match.stats.map((stat) => {
                const total = stat.home + stat.away
                const share = total ? (stat.home / total) * 100 : 50
                return (
                    <li key={stat.key}>
                        <div className="sp-stats__values">
                            <b>{stat.home}{stat.unit ?? ''}</b>
                            <span>{statLabel(stat)}</span>
                            <b>{stat.away}{stat.unit ?? ''}</b>
                        </div>
                        <div className="sp-stats__bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
                    </li>
                )
            })}
        </ul>
    )
}

function Events({ match }) {
    if (!match.events.length) return <div className="sp-state">{t('sports.match.noEvents')}</div>
    return (
        <ol className="sp-events">
            {[...match.events].reverse().map((event, index) => (
                <li key={index} className={`sp-events__item sp-events__item--${event.team} sp-events__item--${event.type}`}>
                    <span className="sp-events__minute">{event.minute}{event.extra ? `+${event.extra}` : ''}'</span>
                    <span className="sp-events__body">
                        <b>{t(`sports.events.${event.type}`)}</b> · {match[event.team].name}
                        {event.player && <> · {event.player}</>}
                        {event.detail && <small>{event.detail}</small>}
                    </span>
                </li>
            ))}
        </ol>
    )
}

const SECTIONS = [
    { id: 'markets', Component: Markets },
    { id: 'stats', Component: Stats },
    { id: 'events', Component: Events },
]

export default function MatchDetail() {
    const { id } = useParams()
    const [section, setSection] = useState('markets')
    const [refresh, setRefresh] = useState(REFRESH_BY_PHASE.live)
    const query = usePolling(async (signal) => {
        const data = await fetchMatch(id, signal)
        setRefresh(REFRESH_BY_PHASE[data.match.status.phase] ?? 0)
        return data
    }, refresh, [id])

    const match = query.data?.match
    const back = <Link to="/sports" className="sp-back">‹ {t('sports.back')}</Link>
    if (!match) {
        return (
            <div className="sp-page">
                {back}
                {query.error ? (
                    <div className="sp-state sp-state--error" role="alert">
                        <p>{query.error.message}</p>
                        <button type="button" onClick={query.reload}>{t('common.retry')}</button>
                    </div>
                ) : <div className="sp-state">{t('sports.loadingMatch')}</div>}
            </div>
        )
    }

    const started = match.status.phase !== 'scheduled'
    const { Component } = SECTIONS.find((s) => s.id === section)
    return (
        <div className="sp-page">
            {back}
            <DataNotice meta={query.data.meta} />

            <header className={`sp-match${match.status.phase === 'live' ? ' is-live' : ''}`}>
                <div className="sp-match__league">
                    {match.league.logo && <img src={match.league.logo} alt="" width="18" height="18" />}
                    <span>{match.league.name}{match.league.round ? ` · ${match.league.round}` : ''}</span>
                    {match.simulated && <span className="sp-tag">{t('sports.simulated')}</span>}
                    <LeagueStar league={match.league} />
                </div>
                <div className="sp-match__board">
                    <div className="sp-match__team"><TeamCrest team={match.home} size={48} /><span>{match.home.name}</span></div>
                    <div className="sp-match__score">
                        {started ? <b>{match.score.home ?? '-'} : {match.score.away ?? '-'}</b> : <b className="sp-match__vs">x</b>}
                        <span className="sp-match__status">{started ? clockText(match.status) : kickoffDateTime(match.kickoff)}</span>
                        {match.score.ht && match.status.code !== '1H' && <small>{t('sports.match.halfTime', { home: match.score.ht.home, away: match.score.ht.away })}</small>}
                    </div>
                    <div className="sp-match__team"><TeamCrest team={match.away} size={48} /><span>{match.away.name}</span></div>
                </div>
                {(match.venue || match.referee) && (
                    <p className="sp-match__info">{[match.venue, match.referee && t('sports.match.referee', { name: match.referee })].filter(Boolean).join(' · ')}</p>
                )}
            </header>

            <div className="sp-tabs" role="tablist" aria-label={t('sports.match.sectionsLabel')}>
                {SECTIONS.map((s) => (
                    <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}>{t(`sports.match.${s.id}`)}</button>
                ))}
            </div>
            <div className="sp-section" role="tabpanel">
                <Component match={match} />
            </div>
        </div>
    )
}
