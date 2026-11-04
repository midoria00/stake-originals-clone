import { useCallback, useEffect, useId, useRef, useState } from 'react'
import MobileBetSheet from '../../components/MobileBetSheet'
import { Coins, CoinIcon } from '../../brand/Brand'
import { useWallet } from '../../context/WalletContext'
import ProvablyFair from '../../utils/ProvablyFair'
import { t } from '../../i18n'
import { formatCoins, formatNumber, formatPercent } from '../../i18n/format'
import {
    STAKE_MIN, STAKE_MAX, TARGET_MIN, TARGET_MAX,
    validateStake, validateTarget, diceWinChance, diceMultiplier, dicePayout, resolveDice, round2,
} from './dice.js'
import '../originals.css'

const fmt2 = formatCoins // plain two-decimal pt-BR number
const QUICK_STAKES = [1, 10, 100, 1000]
const MAX_HISTORY = 20

export const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const toInput = (value) => value.toFixed(2).replace('.', ',')

// Shared by Dice and Limbo: stake, wallet, fair random source, history and the debit -> reveal -> credit flow.
export function useOriginalsRound({ ns, source }) {
    const { balance, placeBet, addWinnings, showToast } = useWallet()
    const pfRef = useRef(null)
    if (!pfRef.current) pfRef.current = new ProvablyFair()
    const busyRef = useRef(false)
    const [busy, setBusy] = useState(false)
    const [stake, setStake] = useState('1,00')
    const [error, setError] = useState('')
    const [announce, setAnnounce] = useState('')
    const [history, setHistory] = useState([])
    const [fairVersion, setFairVersion] = useState(0)

    const errorText = useCallback((code, extra) => t(`${ns}.errors.${code}`, {
        min: formatCoins(STAKE_MIN), max: formatCoins(STAKE_MAX), ...extra,
    }), [ns])

    const adjustStake = (fn) => {
        const current = validateStake(stake, Infinity)
        const base = current.ok ? current.value : STAKE_MIN
        setStake(toInput(Math.min(STAKE_MAX, Math.max(STAKE_MIN, round2(fn(base))))))
    }

    // resolve(r, stakeValue) -> { win, payout, ... } (pure); reveal(outcome) animates; describe(outcome) -> { chip, text }.
    const run = async ({ validate, resolve, reveal, describe }) => {
        if (busyRef.current) return
        const checked = validateStake(stake, balance)
        if (!checked.ok) return setError(errorText(checked.code))
        const extra = validate?.()
        if (extra) return setError(extra)
        busyRef.current = true
        setBusy(true)
        setError('')
        let refundable = false
        try {
            if (!placeBet(checked.value, source)) return setError(errorText('rejected'))
            refundable = true
            const r = await pfRef.current.getResult()
            const outcome = resolve(r, checked.value)
            if (outcome.win) addWinnings(outcome.payout, source)
            refundable = false
            await reveal(outcome)
            const { chip, text } = describe(outcome)
            setHistory((items) => [{ id: `${Date.now()}-${Math.random()}`, win: outcome.win, chip }, ...items].slice(0, MAX_HISTORY))
            setAnnounce(text)
            showToast(outcome.win ? 'win' : 'loss', t(`${ns}.${outcome.win ? 'winTitle' : 'lossTitle'}`), text)
            setFairVersion((v) => v + 1)
        } catch {
            if (refundable) addWinnings(checked.value, source)
            setError(errorText('failed'))
            showToast('error', t(`${ns}.errorTitle`), errorText('failed'))
        } finally {
            busyRef.current = false
            setBusy(false)
        }
    }

    return { balance, pf: pfRef.current, busy, stake, setStake, adjustStake, error, setError, errorText, announce, history, fairVersion, run }
}

export function StakeField({ ns, round }) {
    const { stake, setStake, adjustStake, busy, balance } = round
    const id = useId()
    const max = Math.floor(Math.min(balance, STAKE_MAX) * 100) / 100
    return (
        <div className="og-field">
            <label htmlFor={id} className="og-label">{t(`${ns}.stake`)}</label>
            <div className="og-stake">
                <span className="og-stake__icon"><CoinIcon size={18} /></span>
                <input
                    id={id} className="og-input" type="text" inputMode="decimal" autoComplete="off"
                    value={stake} disabled={busy} aria-describedby={`${id}-hint`}
                    onChange={(e) => setStake(e.target.value)}
                />
                <button type="button" className="og-chip-btn" disabled={busy} aria-label={t(`${ns}.half`)} onClick={() => adjustStake((v) => v / 2)}>½</button>
                <button type="button" className="og-chip-btn" disabled={busy} aria-label={t(`${ns}.double`)} onClick={() => adjustStake((v) => v * 2)}>2×</button>
            </div>
            <p id={`${id}-hint`} className="og-hint">{t(`${ns}.stakeHint`)}</p>
            <div className="og-quick">
                {QUICK_STAKES.map((amount) => (
                    <button key={amount} type="button" className="og-chip-btn" disabled={busy}
                        aria-label={t(`${ns}.quickStake`, { amount: formatCoins(amount) })}
                        onClick={() => setStake(toInput(amount))}>{formatNumber(amount)}</button>
                ))}
                <button type="button" className="og-chip-btn" disabled={busy || max < STAKE_MIN} onClick={() => setStake(toInput(max))}>{t(`${ns}.max`)}</button>
            </div>
        </div>
    )
}

export function HistoryStrip({ ns, items }) {
    return (
        <section className="og-history" aria-label={t(`${ns}.history`)}>
            <h3 className="og-h3">{t(`${ns}.history`)}</h3>
            {items.length === 0 ? <p className="og-hint">{t(`${ns}.historyEmpty`)}</p> : (
                <ul className="og-history__list">
                    {items.map((item) => (
                        <li key={item.id} className={`og-result ${item.win ? 'og-result--win' : 'og-result--loss'}`}
                            aria-label={t(`${ns}.${item.win ? 'historyWin' : 'historyLoss'}`, { value: item.chip })}>
                            {item.chip}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

export function FairnessPanel({ ns, round }) {
    const { pf, busy, fairVersion } = round
    const [data, setData] = useState(null)
    const [seedInput, setSeedInput] = useState('')
    const [revealed, setRevealed] = useState(null)
    const [seedError, setSeedError] = useState('')
    const seedId = useId()

    const load = useCallback(async () => {
        const next = await pf.getFairnessData()
        setData(next)
        setSeedInput(next.clientSeed)
    }, [pf])
    useEffect(() => { load() }, [load, fairVersion])

    const applySeed = async (event) => {
        event.preventDefault()
        const value = seedInput.trim()
        if (!value || value.length > 64) return setSeedError(t(`${ns}.fairness.clientSeedHelp`))
        setSeedError('')
        await pf.setClientSeed(value)
        load()
    }
    const rotate = async () => {
        setRevealed(await pf.rotateSeed())
        load()
    }

    return (
        <details className="og-fair">
            <summary>{t(`${ns}.fairness.title`)}</summary>
            {data && (
                <div className="og-fair__body">
                    <dl className="og-kv">
                        <dt>{t(`${ns}.fairness.serverHash`)}</dt>
                        <dd className="og-mono">{data.serverSeedHash}</dd>
                        <dt>{t(`${ns}.fairness.nonce`)}</dt>
                        <dd className="og-mono">{data.nonce}</dd>
                    </dl>
                    <form className="og-seed" onSubmit={applySeed}>
                        <label htmlFor={seedId} className="og-label">{t(`${ns}.fairness.clientSeed`)}</label>
                        <div className="og-seed__row">
                            <input id={seedId} className="og-input og-mono" type="text" maxLength={64} autoComplete="off" spellCheck={false}
                                value={seedInput} disabled={busy} onChange={(e) => setSeedInput(e.target.value)} />
                            <button type="submit" className="og-btn og-btn--ghost" disabled={busy}>{t(`${ns}.fairness.apply`)}</button>
                        </div>
                        <p className={seedError ? 'og-error' : 'og-hint'} role={seedError ? 'alert' : undefined}>{t(`${ns}.fairness.clientSeedHelp`)}</p>
                    </form>
                    <button type="button" className="og-btn og-btn--ghost" disabled={busy} onClick={rotate}>{t(`${ns}.fairness.rotate`)}</button>
                    {revealed && (
                        <div className="og-revealed" aria-live="polite">
                            <h4 className="og-h3">{t(`${ns}.fairness.revealedTitle`)}</h4>
                            <dl className="og-kv">
                                <dt>{t(`${ns}.fairness.revealedSeed`)}</dt><dd className="og-mono">{revealed.serverSeed}</dd>
                                <dt>{t(`${ns}.fairness.revealedHash`)}</dt><dd className="og-mono">{revealed.serverSeedHash}</dd>
                                <dt>{t(`${ns}.fairness.revealedClient`)}</dt><dd className="og-mono">{revealed.clientSeed}</dd>
                                <dt>{t(`${ns}.fairness.revealedNonces`)}</dt>
                                <dd className="og-mono">{revealed.nonce > 0 ? t(`${ns}.fairness.revealedNoncesValue`, { last: revealed.nonce - 1 }) : t(`${ns}.fairness.revealedNoncesNone`)}</dd>
                            </dl>
                        </div>
                    )}
                    <h4 className="og-h3">{t(`${ns}.fairness.howTitle`)}</h4>
                    <p className="og-hint">{t(`${ns}.fairness.how`)}</p>
                </div>
            )}
        </details>
    )
}

const NS = 'dice'

function DiceGame() {
    const round = useOriginalsRound({ ns: NS, source: 'dice' })
    const { busy, error, setError, errorText, run, announce, stake } = round
    const [targetText, setTargetText] = useState('50,00')
    const [direction, setDirection] = useState('under')
    const [last, setLast] = useState(null) // { roll, win }
    const formId = useId()
    const targetId = useId()

    const target = validateTarget(targetText)
    const chance = target.ok ? diceWinChance(target.value, direction) : null
    const multiplier = target.ok ? diceMultiplier(chance) : null
    const stakeCheck = validateStake(stake, Infinity)
    const payout = target.ok && stakeCheck.ok ? dicePayout(stakeCheck.value, multiplier) : null
    const targetErr = (code) => errorText(code, { min: fmt2(TARGET_MIN), max: fmt2(TARGET_MAX) })

    const play = (event) => {
        event?.preventDefault()
        run({
            validate: () => (target.ok ? '' : targetErr(target.code)),
            resolve: (r, stakeValue) => resolveDice({ r, stake: stakeValue, target: target.value, direction }),
            reveal: async (outcome) => {
                setLast({ roll: outcome.roll, win: outcome.win })
                await wait(prefersReducedMotion() ? 0 : 650)
            },
            describe: (o) => ({
                chip: fmt2(o.roll),
                text: o.win ? t('dice.win', { roll: fmt2(o.roll), amount: fmt2(o.payout) }) : t('dice.loss', { roll: fmt2(o.roll) }),
            }),
        })
    }

    const trackStyle = { '--t': `${target.ok ? target.value : 50}%` }
    const sliderValue = target.ok ? target.value : 50

    return (
        <div className="og-game">
            <MobileBetSheet title={t('dice.controls')} className="og-sheet">
                <form id={formId} className="og-panel" onSubmit={play} noValidate>
                    <StakeField ns={NS} round={round} />
                    <div className="og-field">
                        <span className="og-label" id={`${formId}-dir`}>{t('dice.direction')}</span>
                        <div className="og-seg" role="radiogroup" aria-labelledby={`${formId}-dir`}>
                            {['under', 'over'].map((d) => (
                                <button key={d} type="button" role="radio" aria-checked={direction === d} disabled={busy}
                                    className={`og-seg__btn${direction === d ? ' is-active' : ''}`} onClick={() => setDirection(d)}>
                                    {t(`dice.${d}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="og-field">
                        <label htmlFor={targetId} className="og-label">{t('dice.target')}</label>
                        <input id={targetId} className="og-input" type="text" inputMode="decimal" autoComplete="off" disabled={busy}
                            value={targetText} aria-invalid={!target.ok} onChange={(e) => setTargetText(e.target.value)} />
                        <input className="og-range" type="range" min={TARGET_MIN} max={TARGET_MAX} step="0.01" disabled={busy}
                            aria-label={t('dice.targetSlider')} value={sliderValue}
                            onChange={(e) => setTargetText(toInput(Number(e.target.value)))} />
                    </div>
                    <p className="og-error" role="alert">{error || (!target.ok && targetText !== '' ? targetErr(target.code) : '')}</p>
                    <button type="submit" className="og-btn og-btn--play" disabled={busy}>{busy ? t('dice.playing') : t('dice.play')}</button>
                </form>
            </MobileBetSheet>

            <section className="og-stage" aria-label={t('dice.stage')}>
                <header>
                    <h2 className="og-title">{t('dice.title')}</h2>
                    <p className="og-hint">{t('dice.subtitle')}</p>
                </header>
                <div className={`og-bignum${last && !busy ? (last.win ? ' is-win' : ' is-loss') : ''}`} aria-hidden="true">
                    {busy ? '···' : last ? fmt2(last.roll) : '—'}
                </div>
                <div className="og-track-wrap">
                    <div className={`og-track og-track--${direction}`} style={trackStyle} role="img"
                        aria-label={`${t('dice.zoneWin')}: ${t(`dice.${direction}`)} ${target.ok ? fmt2(target.value) : ''}`}>
                        {last && <div className={`og-marker${last.win ? ' is-win' : ' is-loss'}`} style={{ left: `${last.roll}%` }}><span>{fmt2(last.roll)}</span></div>}
                    </div>
                    <div className="og-ticks" aria-hidden="true">{[0, 25, 50, 75, 100].map((n) => <span key={n}>{n}</span>)}</div>
                </div>
                <dl className="og-readouts">
                    <div><dt>{t('dice.winChance')}</dt><dd>{chance == null ? '—' : formatPercent(chance / 100, 2)}</dd></div>
                    <div><dt>{t('dice.multiplier')}</dt><dd>{multiplier == null ? '—' : `${formatNumber(multiplier, 4)}×`}</dd></div>
                    <div><dt>{t('dice.payout')}</dt><dd>{payout == null ? '—' : <Coins value={payout} />}</dd></div>
                </dl>
                <button type="submit" form={formId} className="og-btn og-btn--play og-play-stage" disabled={busy}>{busy ? t('dice.playing') : t('dice.play')}</button>
                <p className="og-sr" role="status" aria-live="polite">{announce}</p>
                <HistoryStrip ns={NS} items={round.history} />
                <FairnessPanel ns={NS} round={round} />
            </section>
        </div>
    )
}

export default DiceGame
