import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { t } from '../i18n'
import { useFavoriteLeagues } from '../lib/storage'
import { useBetSlip } from './BetSlipContext'
import { clockText, kickoffTime, oddText, selectionLabel } from './format'

export function TeamCrest({ team, size = 22 }) {
    const [failed, setFailed] = useState(false)
    if (team.logo && !failed) {
        return <img className="sp-crest" src={team.logo} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
    }
    const initials = team.name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
    const hue = [...team.name].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 360, 0)
    return (
        <span className="sp-crest sp-crest--initials" style={{ width: size, height: size, background: `hsl(${hue} 45% 32%)` }} aria-hidden="true">
            {initials}
        </span>
    )
}

// `label` is the short text on the button (1 / X / 2 or the full pick); `ariaLabel` names the pick for screen readers.
export function OddButton({ match, market, selection, label, ariaLabel }) {
    const { isSelected, toggle } = useBetSlip()
    const open = match.status.phase === 'scheduled' || match.status.phase === 'live'
    const selected = isSelected(match.id, selection.id)
    const odd = selection.suspended ? '—' : oddText(selection.odd)
    return (
        <button
            type="button"
            className={`sp-odd${selected ? ' is-selected' : ''}`}
            disabled={!open || selection.suspended}
            aria-pressed={selected}
            aria-label={ariaLabel ? `${ariaLabel}: ${selection.suspended ? t('sports.suspended') : odd}` : undefined}
            title={selection.suspended ? t('sports.suspended') : undefined}
            onClick={() => toggle(match, market, selection)}
        >
            {label && <span className="sp-odd__label">{label}</span>}
            <span className="sp-odd__value">{odd}</span>
        </button>
    )
}

export function LeagueStar({ league }) {
    const favorites = useFavoriteLeagues()
    const on = favorites.has(league.id)
    return (
        <button
            type="button"
            className={`sp-star${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={t(on ? 'sports.unfavoriteLeague' : 'sports.favoriteLeague', { league: league.name })}
            title={t(on ? 'sports.unfavoriteLeague' : 'sports.favoriteLeague', { league: league.name })}
            onClick={() => favorites.toggle(league)}
        >
            <Star size={15} aria-hidden="true" fill={on ? 'currentColor' : 'none'} />
        </button>
    )
}

export function DataNotice({ meta }) {
    if (!meta) return null
    if (meta.simulated) {
        return (
            <p className="sp-notice sp-notice--demo" role="note">
                <strong>{t('sports.demoTitle')}</strong> {t('sports.demoBody')}
            </p>
        )
    }
    return (
        <p className="sp-notice" role="note">
            {t('sports.dataSource', { source: meta.source, time: new Date(meta.updatedAt).toLocaleTimeString('pt-BR') })}
        </p>
    )
}

const PICK_SHORT = { home: '1', draw: 'X', away: '2' }

export function MatchRow({ match }) {
    const main = match.odds?.main
    const started = match.status.phase !== 'scheduled'
    const over = match.status.phase === 'finished' || match.status.phase === 'cancelled'
    const href = `/sports/match/${match.id}`
    return (
        <div className={`sp-row${match.status.phase === 'live' ? ' is-live' : ''}`}>
            <Link to={href} className="sp-row__info">
                <span className="sp-row__clock">{started ? clockText(match.status) : kickoffTime(match.kickoff)}</span>
                <span className="sp-row__teams">
                    {['home', 'away'].map((side) => (
                        <span key={side} className="sp-row__team">
                            <TeamCrest team={match[side]} size={20} />
                            <span className="sp-row__name">{match[side].name}</span>
                            {started && <b className="sp-row__goals">{match.score[side] ?? '-'}</b>}
                        </span>
                    ))}
                </span>
                {match.simulated && <span className="sp-tag">{t('sports.simulated')}</span>}
            </Link>
            <div className="sp-row__odds">
                {main
                    ? main.selections.map((selection) => (
                        <OddButton
                            key={selection.id}
                            match={match}
                            market={main}
                            selection={selection}
                            label={PICK_SHORT[selection.pick]}
                            ariaLabel={selectionLabel(main.key, selection, match)}
                        />
                    ))
                    : <span className="sp-row__no-odds">{over ? '' : t('sports.noOdds')}</span>}
            </div>
            <Link to={href} className="sp-row__more" aria-label={t('sports.moreFor', { home: match.home.name, away: match.away.name })}>›</Link>
        </div>
    )
}
