import { useState } from 'react'
import { CoinIcon, Coins } from '../brand/Brand'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { MAX_STAKE, MIN_STAKE, useBetSlip } from './BetSlipContext'
import { kickoffDateTime, money, oddText, resultLabel } from './format'
import './sports.css'

function StakeInput({ id, value, onChange, label }) {
    return (
        <label className="sp-stake" htmlFor={id}>
            <span>{label}</span>
            <span className="sp-stake__field">
                <CoinIcon size={14} />
                <input
                    id={id}
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
        selections, mode, setMode, stakes, setStakes, placing, message, plannedBets,
        remove, clear, check, place, totalOdd, totalStake, potentialReturn,
    } = useBetSlip()
    // Two steps: "Revisar aposta" validates and shows a summary, "Confirmar aposta" places it.
    const [reviewing, setReviewing] = useState(false)

    if (!selections.length) {
        return (
            <div className="sp-slip__empty">
                <p>{t('sports.slip.empty')}</p>
                <p>{t('sports.slip.emptyHint')}</p>
                {message?.type === 'success' && <p className="sp-msg sp-msg--success" role="status">{message.text}</p>}
            </div>
        )
    }

    const edit = (fn) => (...args) => {
        setReviewing(false)
        fn(...args)
    }
    const setStake = edit((key, value) => setStakes((previous) => ({ ...previous, [key]: value })))
    const confirm = async () => {
        await place()
        setReviewing(false)
    }
    const primary = message?.type === 'warning'
        ? { label: t('sports.slip.acceptOdds'), action: confirm }
        : reviewing
            ? { label: t('sports.slip.confirm'), action: confirm }
            : { label: t('sports.slip.review'), action: () => check() && setReviewing(true) }

    return (
        <div className="sp-slip__body">
            <div className="sp-segment" role="tablist" aria-label={t('sports.slip.typeLabel')}>
                <button type="button" role="tab" aria-selected={mode === 'single'} onClick={edit(() => setMode('single'))}>{t('sports.slip.single')}</button>
                <button type="button" role="tab" aria-selected={mode === 'multiple'} disabled={selections.length < 2} onClick={edit(() => setMode('multiple'))}>
                    {t('sports.slip.multiple')}
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
                            <button type="button" className="sp-pick__remove" aria-label={t('sports.slip.remove', { label: s.label })} onClick={edit(() => remove(s.key))}>×</button>
                        </div>
                        <div className="sp-pick__meta">
                            {s.marketLabel} · {s.home} x {s.away}
                            {s.live && <span className="sp-tag sp-tag--live">{t('sports.slip.live')}</span>}
                            {s.simulated && <span className="sp-tag">{t('sports.simulated')}</span>}
                        </div>
                        {mode === 'single' && (
                            <StakeInput id={`stake-${s.key}`} label={t('sports.slip.stake')} value={stakes[s.key]} onChange={(value) => setStake(s.key, value)} />
                        )}
                    </li>
                ))}
            </ul>

            {mode === 'multiple' && (
                <div className="sp-slip__multiple">
                    <div className="sp-slip__line"><span>{t('sports.slip.totalOdd', { count: selections.length })}</span><b>{oddText(totalOdd)}</b></div>
                    <StakeInput id="stake-multiple" label={t('sports.slip.multipleStake')} value={stakes.multiple} onChange={(value) => setStake('multiple', value)} />
                </div>
            )}

            <div className="sp-slip__summary">
                <div className="sp-slip__line"><span>{t('sports.slip.totalStake')}</span><b><Coins value={totalStake} /></b></div>
                <div className="sp-slip__line"><span>{t('sports.slip.potentialReturn')}</span><b className="sp-positive"><Coins value={potentialReturn} /></b></div>
                <div className="sp-slip__line sp-muted"><span>{t('sports.slip.balance')}</span><span><Coins value={balance} size={14} /></span></div>
            </div>

            {reviewing && !message && (
                <div className="sp-review" role="status">
                    <strong>{t('sports.slip.reviewTitle')}</strong>
                    <p>{t('sports.slip.reviewBody', { count: plannedBets.length, stake: money(totalStake), potential: money(potentialReturn) })}</p>
                </div>
            )}
            {message && <p className={`sp-msg sp-msg--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

            <button type="button" className="sp-place" onClick={primary.action} disabled={placing}>
                {placing ? t('sports.slip.checking') : primary.label}
            </button>
            {reviewing
                ? <button type="button" className="sp-link" onClick={() => setReviewing(false)}>{t('sports.slip.back')}</button>
                : <button type="button" className="sp-link" onClick={edit(clear)}>{t('sports.slip.clear')}</button>}
            <p className="sp-slip__limits">{t('sports.slip.limits', { min: money(MIN_STAKE), max: money(MAX_STAKE) })}</p>
        </div>
    )
}

// Bets in the local shape (visitors' stored bets, or server bets through fromServerBet).
export function BetCards({ bets }) {
    return (
        <ul className="sp-bets">
            {bets.map((bet) => (
                <li key={bet.id} className={`sp-bet sp-bet--${bet.status}`}>
                    <div className="sp-bet__head">
                        <span>
                            {bet.type === 'multiple' ? t('sports.slip.multipleCount', { count: bet.legs.length }) : t('sports.slip.single')}
                            {bet.server && bet.simulated && <span className="sp-tag">{t('sports.simulated')}</span>}
                        </span>
                        <span className={`sp-status sp-status--${bet.status}`}>{resultLabel(bet.status)}</span>
                    </div>
                    <ul className="sp-bet__legs">
                        {bet.legs.map((leg, index) => (
                            <li key={index}>
                                <span className={`sp-dot sp-dot--${leg.result}`} aria-label={resultLabel(leg.result)} title={resultLabel(leg.result)} />
                                <span>
                                    <b>{leg.label}</b> @ {oddText(leg.odd)}
                                    <small>
                                        {leg.marketLabel} · {leg.matchLabel ?? `${leg.home} x ${leg.away}`}
                                        {leg.kickoff && ` · ${kickoffDateTime(leg.kickoff)}`}
                                    </small>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="sp-bet__foot">
                        <span>{t('sports.slip.stakeAt', { stake: money(bet.stake), odd: oddText(bet.odd) })}</span>
                        <b>{bet.status === 'pending' ? t('sports.slip.possible', { amount: money(bet.potential) }) : t('sports.slip.returned', { amount: money(bet.payout ?? 0) })}</b>
                    </div>
                </li>
            ))}
        </ul>
    )
}

// status: 'open' | 'settled' | undefined (all, open first). Also used by the "Minhas apostas" page.
export function BetList({ status, emptyText = t('sports.slip.noBets') }) {
    const { bets } = useBetSlip()
    const filtered = status ? bets.filter((bet) => (bet.status === 'pending') === (status === 'open')) : bets
    if (!filtered.length) return <div className="sp-slip__empty"><p>{emptyText}</p></div>
    // Open bets first; the stored order (newest first) is kept inside each group.
    return <BetCards bets={[...filtered].sort((a, b) => (b.status === 'pending') - (a.status === 'pending'))} />
}

export default function BetSlip() {
    const { selections, bets } = useBetSlip()
    const [tab, setTab] = useState('slip')
    const open = bets.filter((bet) => bet.status === 'pending').length
    return (
        <section className="sp-slip">
            <div className="sp-segment sp-segment--tabs" role="tablist" aria-label={t('sports.slip.label')}>
                <button type="button" role="tab" aria-selected={tab === 'slip'} onClick={() => setTab('slip')}>
                    {t('sports.slip.tabSlip')} {selections.length > 0 && <span className="sp-count">{selections.length}</span>}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'bets'} onClick={() => setTab('bets')}>
                    {t('sports.slip.tabBets')} {open > 0 && <span className="sp-count">{open}</span>}
                </button>
            </div>
            {tab === 'slip' ? <Slip /> : <BetList />}
            <p className="sp-slip__disclaimer">{t('sports.slip.disclaimer')}</p>
        </section>
    )
}
