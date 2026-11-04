import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMatch } from './api'
import { DataNotice, OddButton, TeamCrest } from './components'
import { clockText, kickoffDateTime, selectionLabel } from './format'
import { usePolling } from './usePolling'

const REFRESH_BY_PHASE = { live: 20_000, scheduled: 60_000 }

const EVENT_LABELS = {
    goal: 'Gol',
    penalty: 'Gol de pênalti',
    own_goal: 'Gol contra',
    missed_penalty: 'Pênalti perdido',
    yellow: 'Cartão amarelo',
    red: 'Cartão vermelho',
    sub: 'Substituição',
    var: 'VAR',
}

function groupMarkets(markets) {
    const groups = new Map()
    for (const market of markets) {
        if (!groups.has(market.key)) groups.set(market.key, { key: market.key, label: market.label, source: market.source, markets: [] })
        groups.get(market.key).markets.push(market)
    }
    return [...groups.values()]
}

function Markets({ match }) {
    if (!match.markets.length) {
        return <div className="sp-state">{match.status.phase === 'finished' || match.status.phase === 'cancelled' ? 'Mercados encerrados.' : 'Odds indisponíveis para esta partida no momento.'}</div>
    }
    return groupMarkets(match.markets).map((group) => (
        <section key={group.key} className="sp-market">
            <h3>{group.label}{group.source && <small>{group.source}</small>}</h3>
            {group.markets.map((market) => (
                <div key={`${market.key}-${market.line}`} className={`sp-market__line sp-market__line--${market.selections.length}`}>
                    {market.selections.map((selection) => (
                        <OddButton key={selection.id} match={match} market={market} selection={selection} label={selectionLabel(market.key, selection, match)} />
                    ))}
                </div>
            ))}
        </section>
    ))
}

function Stats({ match }) {
    if (!match.stats.length) return <div className="sp-state">Estatísticas disponíveis a partir do início da partida.</div>
    return (
        <ul className="sp-stats">
            {match.stats.map((stat) => {
                const total = stat.home + stat.away
                const share = total ? (stat.home / total) * 100 : 50
                return (
                    <li key={stat.key}>
                        <div className="sp-stats__values">
                            <b>{stat.home}{stat.unit ?? ''}</b>
                            <span>{stat.label}</span>
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
    if (!match.events.length) return <div className="sp-state">Nenhum evento registrado.</div>
    return (
        <ol className="sp-events">
            {[...match.events].reverse().map((event, index) => (
                <li key={index} className={`sp-events__item sp-events__item--${event.team} sp-events__item--${event.type}`}>
                    <span className="sp-events__minute">{event.minute}{event.extra ? `+${event.extra}` : ''}'</span>
                    <span className="sp-events__body">
                        <b>{EVENT_LABELS[event.type]}</b> · {match[event.team].name}
                        {event.player && <> · {event.player}</>}
                        {event.detail && <small>{event.detail}</small>}
                    </span>
                </li>
            ))}
        </ol>
    )
}

const SECTIONS = [
    { id: 'markets', label: 'Mercados', Component: Markets },
    { id: 'stats', label: 'Estatísticas', Component: Stats },
    { id: 'events', label: 'Eventos', Component: Events },
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
    if (!match) {
        return (
            <div className="sp-page">
                <Link to="/sports" className="sp-back">‹ Futebol</Link>
                {query.error ? (
                    <div className="sp-state sp-state--error" role="alert">
                        <p>{query.error.message}</p>
                        <button type="button" onClick={query.reload}>Tentar de novo</button>
                    </div>
                ) : <div className="sp-state">Carregando partida…</div>}
            </div>
        )
    }

    const started = match.status.phase !== 'scheduled'
    const { Component } = SECTIONS.find((s) => s.id === section)
    return (
        <div className="sp-page">
            <Link to="/sports" className="sp-back">‹ Futebol</Link>
            <DataNotice meta={query.data.meta} />

            <header className={`sp-match${match.status.phase === 'live' ? ' is-live' : ''}`}>
                <div className="sp-match__league">
                    {match.league.logo && <img src={match.league.logo} alt="" width="18" height="18" />}
                    <span>{match.league.name}{match.league.round ? ` · ${match.league.round}` : ''}</span>
                    {match.simulated && <span className="sp-tag">Simulado</span>}
                </div>
                <div className="sp-match__board">
                    <div className="sp-match__team"><TeamCrest team={match.home} size={48} /><span>{match.home.name}</span></div>
                    <div className="sp-match__score">
                        {started ? <b>{match.score.home ?? '-'} : {match.score.away ?? '-'}</b> : <b className="sp-match__vs">x</b>}
                        <span className="sp-match__status">{started ? clockText(match.status) : kickoffDateTime(match.kickoff)}</span>
                        {match.score.ht && match.status.code !== '1H' && <small>Intervalo: {match.score.ht.home} : {match.score.ht.away}</small>}
                    </div>
                    <div className="sp-match__team"><TeamCrest team={match.away} size={48} /><span>{match.away.name}</span></div>
                </div>
                {(match.venue || match.referee) && (
                    <p className="sp-match__info">{[match.venue, match.referee && `Árbitro: ${match.referee}`].filter(Boolean).join(' · ')}</p>
                )}
            </header>

            <div className="sp-tabs" role="tablist" aria-label="Detalhes da partida">
                {SECTIONS.map((s) => (
                    <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}>{s.label}</button>
                ))}
            </div>
            <div className="sp-section" role="tabpanel">
                <Component match={match} />
            </div>
        </div>
    )
}
