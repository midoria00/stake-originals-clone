import { useEffect, useId, useRef, useState } from 'react'
import MobileBetSheet from '../../components/MobileBetSheet'
import { Coins } from '../../brand/Brand'
import { t } from '../../i18n'
import { formatCoins, formatPercent } from '../../i18n/format'
import { FairnessPanel, HistoryStrip, StakeField, prefersReducedMotion, useOriginalsRound } from '../dice/DiceGame'
import { TARGET_MAX, TARGET_MIN, validateStake, limboPayout, limboWinChance, resolveLimbo, validateTarget } from './limbo.js'
import '../originals.css'

const NS = 'limbo'
const QUICK_TARGETS = [1.5, 2, 5, 10, 100]
const COUNT_MS = 900
const fmtX = (value) => `${formatCoins(value)}×`

function LimboGame() {
    const round = useOriginalsRound({ ns: NS, source: 'limbo' })
    const { busy, error, errorText, run, announce, stake } = round
    const [targetText, setTargetText] = useState('2,00')
    const [shown, setShown] = useState(null) // number being displayed, null before the first round
    const [state, setState] = useState('idle') // idle | counting | win | loss
    const frameRef = useRef(0)
    const formId = useId()
    const targetId = useId()

    useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

    const target = validateTarget(targetText)
    const chance = target.ok ? limboWinChance(target.value) : null
    const stakeCheck = validateStake(stake, Infinity)
    const payout = target.ok && stakeCheck.ok ? limboPayout(stakeCheck.value, target.value) : null
    const targetErr = (code) => errorText(code, { min: fmtX(TARGET_MIN), max: fmtX(TARGET_MAX) })

    // Geometric count-up from 1.00x to the result, so 1,000,000x is as readable as 2x.
    const countUp = (result) => new Promise((resolve) => {
        if (prefersReducedMotion() || result <= 1) { setShown(result); return resolve() }
        const start = performance.now()
        const tick = (now) => {
            const p = Math.min(1, (now - start) / COUNT_MS)
            setShown(p >= 1 ? result : Math.floor(Math.pow(result, 1 - Math.pow(1 - p, 3)) * 100) / 100)
            if (p >= 1) resolve()
            else frameRef.current = requestAnimationFrame(tick)
        }
        frameRef.current = requestAnimationFrame(tick)
    })

    const play = (event) => {
        event?.preventDefault()
        run({
            validate: () => (target.ok ? '' : targetErr(target.code)),
            resolve: (r, stakeValue) => resolveLimbo({ r, stake: stakeValue, target: target.value }),
            reveal: async (outcome) => {
                setState('counting')
                await countUp(outcome.result)
                setState(outcome.win ? 'win' : 'loss')
            },
            describe: (o) => ({
                chip: fmtX(o.result),
                text: o.win ? t('limbo.win', { result: fmtX(o.result), amount: formatCoins(o.payout) }) : t('limbo.loss', { result: fmtX(o.result) }),
            }),
        })
    }

    return (
        <div className="og-game">
            <MobileBetSheet title={t('limbo.controls')} className="og-sheet">
                <form id={formId} className="og-panel" onSubmit={play} noValidate>
                    <StakeField ns={NS} round={round} />
                    <div className="og-field">
                        <label htmlFor={targetId} className="og-label">{t('limbo.target')}</label>
                        <input id={targetId} className="og-input" type="text" inputMode="decimal" autoComplete="off" disabled={busy}
                            value={targetText} aria-invalid={!target.ok} onChange={(e) => setTargetText(e.target.value)} />
                        <div className="og-quick">
                            {QUICK_TARGETS.map((value) => (
                                <button key={value} type="button" className="og-chip-btn" disabled={busy}
                                    aria-label={t('limbo.quickTarget', { value: fmtX(value) })}
                                    onClick={() => setTargetText(value.toFixed(2).replace('.', ','))}>{value}×</button>
                            ))}
                        </div>
                    </div>
                    <p className="og-error" role="alert">{error || (!target.ok && targetText !== '' ? targetErr(target.code) : '')}</p>
                    <button type="submit" className="og-btn og-btn--play" disabled={busy}>{busy ? t('limbo.playing') : t('limbo.play')}</button>
                </form>
            </MobileBetSheet>

            <section className="og-stage" aria-label={t('limbo.stage')}>
                <header>
                    <h2 className="og-title">{t('limbo.title')}</h2>
                    <p className="og-hint">{t('limbo.subtitle')}</p>
                </header>
                <div className={`og-bignum og-bignum--xl${state === 'win' ? ' is-win' : state === 'loss' ? ' is-loss' : ''}`} aria-hidden="true">
                    {shown == null ? '1,00×' : fmtX(shown)}
                </div>
                <dl className="og-readouts">
                    <div><dt>{t('limbo.target')}</dt><dd>{target.ok ? fmtX(target.value) : '—'}</dd></div>
                    <div><dt>{t('limbo.winChance')}</dt><dd>{chance == null ? '—' : formatPercent(chance, chance >= 0.01 ? 2 : chance >= 0.0001 ? 4 : 6)}</dd></div>
                    <div><dt>{t('limbo.payout')}</dt><dd>{payout == null ? '—' : <Coins value={payout} />}</dd></div>
                </dl>
                <button type="submit" form={formId} className="og-btn og-btn--play og-play-stage" disabled={busy}>{busy ? t('limbo.playing') : t('limbo.play')}</button>
                <p className="og-sr" role="status" aria-live="polite">{announce}</p>
                <HistoryStrip ns={NS} items={round.history} />
                <FairnessPanel ns={NS} round={round} />
            </section>
        </div>
    )
}

export default LimboGame
