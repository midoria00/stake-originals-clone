import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBetSlip } from './BetSlipContext'
import { clockText, kickoffTime, oddText } from './format'

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

export function OddButton({ match, market, selection, label }) {
    const { isSelected, toggle } = useBetSlip()
    const open = match.status.phase === 'scheduled' || match.status.phase === 'live'
    const selected = isSelected(match.id, selection.id)
    return (
        <button
            type="button"
            className={`sp-odd${selected ? ' is-selected' : ''}`}
            disabled={!open || selection.suspended}
            aria-pressed={selected}
            title={selection.suspended ? 'Mercado suspenso' : undefined}
            onClick={() => toggle(match, market, selection)}
        >
            {label && <span className="sp-odd__label">{label}</span>}
            <span className="sp-odd__value">{selection.suspended ? '—' : oddText(selection.odd)}</span>
        </button>
    )
}

export function DataNotice({ meta }) {
    if (!meta) return null
    if (meta.simulated) {
        return (
            <p className="sp-notice sp-notice--demo" role="note">
                <strong>Modo demonstração.</strong> Partidas, placares, estatísticas e odds desta seção são <strong>simulados</strong> e não
                correspondem a jogos reais. Dados reais aparecem quando um fornecedor autorizado estiver configurado.
            </p>
        )
    }
    return (
        <p className="sp-notice" role="note">
            Dados: {meta.source} · atualizado às {new Date(meta.updatedAt).toLocaleTimeString('pt-BR')}. As odds são referência do mercado; as
            apostas aqui usam apenas créditos fictícios.
        </p>
    )
}

const PICK_SHORT = { home: '1', draw: 'X', away: '2' }

export function MatchRow({ match }) {
    const main = match.odds?.main
    const started = match.status.phase !== 'scheduled'
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
                {match.simulated && <span className="sp-tag">Simulado</span>}
            </Link>
            <div className="sp-row__odds">
                {main
                    ? main.selections.map((selection) => (
                        <OddButton key={selection.id} match={match} market={main} selection={selection} label={PICK_SHORT[selection.pick]} />
                    ))
                    : <span className="sp-row__no-odds">{started ? match.status.label : 'Odds indisponíveis'}</span>}
            </div>
            <Link to={href} className="sp-row__more" aria-label={`Mercados e estatísticas de ${match.home.name} x ${match.away.name}`}>›</Link>
        </div>
    )
}
