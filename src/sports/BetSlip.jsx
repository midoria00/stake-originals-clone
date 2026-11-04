import { useState } from 'react'
import { useWallet } from '../context/WalletContext'
import { MAX_STAKE, MIN_STAKE, stakeValue, useBetSlip } from './BetSlipContext'
import { kickoffDateTime, money, oddText, RESULT_LABELS } from './format'

function StakeInput({ id, value, onChange, label }) {
    return (
        <label className="sp-stake" htmlFor={id}>
            <span>{label}</span>
            <span className="sp-stake__field">
                <span aria-hidden="true">₿</span>
                <input
                    id={id}
                    aria-label={label}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={value ?? ''}
                    onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ''))}
                />
            </span>
        </label>
    )
}

function Slip() {
    const { balance } = useWallet()
    const {
        selections, mode, setMode, stakes, setStakes, placing, message,
        remove, clear, place, totalOdd, totalStake, potentialReturn,
    } = useBetSlip()

    if (!selections.length) {
        return (
            <div className="sp-slip__empty">
                <p>Seu bilhete está vazio.</p>
                <p>Toque em uma odd para adicionar a seleção.</p>
                {message?.type === 'success' && <p className="sp-msg sp-msg--success" role="status">{message.text}</p>}
            </div>
        )
    }

    const setStake = (key, value) => setStakes((previous) => ({ ...previous, [key]: value }))

    return (
        <div className="sp-slip__body">
            <div className="sp-segment" role="tablist" aria-label="Tipo de aposta">
                <button type="button" role="tab" aria-selected={mode === 'single'} onClick={() => setMode('single')}>Simples</button>
                <button type="button" role="tab" aria-selected={mode === 'multiple'} disabled={selections.length < 2} onClick={() => setMode('multiple')}>
                    Múltipla
                </button>
            </div>

            <ul className="sp-slip__list">
                {selections.map((s) => (
                    <li key={s.key} className="sp-pick">
                        <div className="sp-pick__head">
                            <span className="sp-pick__label">{s.label}</span>
                            <span className="sp-pick__odd">
                                {s.previousOdd && s.previousOdd !== s.odd && <s>{oddText(s.previousOdd)}</s>} {oddText(s.odd)}
                            </span>
                            <button type="button" className="sp-pick__remove" aria-label={`Remover ${s.label}`} onClick={() => remove(s.key)}>×</button>
                        </div>
                        <div className="sp-pick__meta">
                            {s.marketLabel} · {s.home} x {s.away}
                            {s.live && <span className="sp-tag sp-tag--live">Ao vivo</span>}
                            {s.simulated && <span className="sp-tag">Simulado</span>}
                        </div>
                        {mode === 'single' && (
                            <StakeInput id={`stake-${s.key}`} label="Valor" value={stakes[s.key]} onChange={(value) => setStake(s.key, value)} />
                        )}
                    </li>
                ))}
            </ul>

            {mode === 'multiple' && (
                <div className="sp-slip__multiple">
                    <div className="sp-slip__line"><span>Odd total ({selections.length} seleções)</span><b>{oddText(totalOdd)}</b></div>
                    <StakeInput id="stake-multiple" label="Valor da múltipla" value={stakes.multiple} onChange={(value) => setStake('multiple', value)} />
                </div>
            )}

            <div className="sp-slip__summary">
                <div className="sp-slip__line"><span>Total apostado</span><b>{money(totalStake)}</b></div>
                <div className="sp-slip__line"><span>Retorno potencial</span><b className="sp-positive">{money(potentialReturn)}</b></div>
                <div className="sp-slip__line sp-muted"><span>Saldo fictício</span><span>{money(balance)}</span></div>
            </div>

            {message && <p className={`sp-msg sp-msg--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

            <button type="button" className="sp-place" onClick={place} disabled={placing}>
                {placing ? 'Conferindo odds…' : message?.type === 'warning' ? 'Aceitar novas odds e apostar' : 'Fazer aposta'}
            </button>
            <button type="button" className="sp-link" onClick={clear}>Limpar bilhete</button>
            <p className="sp-slip__limits">Valor por aposta: {money(MIN_STAKE)} a {money(MAX_STAKE)}.</p>
        </div>
    )
}

function MyBets() {
    const { bets } = useBetSlip()
    if (!bets.length) return <div className="sp-slip__empty"><p>Você ainda não fez apostas esportivas.</p></div>
    // Open bets first; the stored order (newest first) is kept inside each group.
    const ordered = [...bets].sort((a, b) => (b.status === 'pending') - (a.status === 'pending'))
    return (
        <ul className="sp-bets">
            {ordered.map((bet) => (
                <li key={bet.id} className={`sp-bet sp-bet--${bet.status}`}>
                    <div className="sp-bet__head">
                        <span>{bet.type === 'multiple' ? `Múltipla (${bet.legs.length})` : 'Simples'}</span>
                        <span className={`sp-status sp-status--${bet.status}`}>{RESULT_LABELS[bet.status]}</span>
                    </div>
                    <ul className="sp-bet__legs">
                        {bet.legs.map((leg, index) => (
                            <li key={index}>
                                <span className={`sp-dot sp-dot--${leg.result}`} aria-label={RESULT_LABELS[leg.result]} title={RESULT_LABELS[leg.result]} />
                                <span>
                                    <b>{leg.label}</b> @ {oddText(leg.odd)}
                                    <small>{leg.marketLabel} · {leg.home} x {leg.away} · {kickoffDateTime(leg.kickoff)}</small>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="sp-bet__foot">
                        <span>Aposta {money(bet.stake)} @ {oddText(bet.odd)}</span>
                        <b>{bet.status === 'pending' ? `Possível ${money(bet.potential)}` : `Retorno ${money(bet.payout ?? 0)}`}</b>
                    </div>
                </li>
            ))}
        </ul>
    )
}

export default function BetSlip() {
    const { selections, bets } = useBetSlip()
    const [tab, setTab] = useState('slip')
    const open = bets.filter((bet) => bet.status === 'pending').length
    return (
        <section className="sp-slip">
            <div className="sp-segment sp-segment--tabs" role="tablist" aria-label="Bilhete">
                <button type="button" role="tab" aria-selected={tab === 'slip'} onClick={() => setTab('slip')}>
                    Bilhete {selections.length > 0 && <span className="sp-count">{selections.length}</span>}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'bets'} onClick={() => setTab('bets')}>
                    Minhas apostas {open > 0 && <span className="sp-count">{open}</span>}
                </button>
            </div>
            {tab === 'slip' ? <Slip /> : <MyBets />}
            <p className="sp-slip__disclaimer">Apostas simuladas com créditos fictícios. Não há depósitos, saques nem dinheiro real.</p>
        </section>
    )
}
