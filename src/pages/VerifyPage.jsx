import { useState } from 'react'
import { DINO_SURVIVAL } from '../components/DinoGame/difficulties'
import Page from '../components/Page'
import { diceRoll } from '../games/dice/dice'
import { limboResult } from '../games/limbo/limbo'
import { t, tRaw } from '../i18n'
import { formatCoins, formatMultiplier, formatNumber, formatPercent } from '../i18n/format'
import { crashPointFromFloat, floatFromHash, minePositionsFromHash, roundHash, sha256 } from '../utils/ProvablyFair'

// Plinko is left out on purpose: the game never reveals its server seed (see pages.verify.plinkoNote).
const GAMES = ['crash', 'dice', 'limbo', 'dino', 'mines']
const GAME_LABELS = { crash: 'Crash', dice: 'Dice', limbo: 'Limbo', dino: 'Dino Run', mines: 'Mines' }

// Exported for tests: the same pure rules the games use, applied to one round.
export function describeRound(game, r, hash, { mines = 3, difficulty = 'medium' } = {}) {
    switch (game) {
        case 'crash': return { main: formatMultiplier(crashPointFromFloat(r)) }
        case 'dice': return { main: formatCoins(diceRoll(r)) }
        case 'limbo': return { main: `${formatCoins(limboResult(r))}×` }
        case 'dino': {
            const chance = DINO_SURVIVAL[difficulty]
            return { main: t(r < chance ? 'pages.verify.dinoPassed' : 'pages.verify.dinoFailed', { chance: formatPercent(chance, 0) }) }
        }
        case 'mines': return { positions: minePositionsFromHash(hash, mines) }
        default: return {}
    }
}

function MinesBoard({ positions }) {
    return (
        <ol className="mines-board" aria-label={t('pages.verify.minesGrid')}>
            {Array.from({ length: 25 }, (_, i) => {
                const mine = positions.includes(i)
                const label = t('pages.verify.mineCell', { row: Math.floor(i / 5) + 1, col: (i % 5) + 1, state: t(mine ? 'pages.verify.mine' : 'pages.verify.gem') })
                return <li key={i} className={mine ? 'is-mine' : ''} aria-label={label} title={label}>{mine ? '✕' : '◆'}</li>
            })}
        </ol>
    )
}

export default function VerifyPage() {
    const [form, setForm] = useState({ game: 'crash', serverSeed: '', clientSeed: '', nonce: '0', mines: '3', difficulty: 'medium' })
    const [error, setError] = useState('')
    const [result, setResult] = useState(null)
    const [busy, setBusy] = useState(false)
    const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

    const submit = async (event) => {
        event.preventDefault()
        const serverSeed = form.serverSeed.trim()
        const clientSeed = form.clientSeed.trim()
        const nonce = Number(form.nonce)
        const mines = Number(form.mines)
        const problem = !serverSeed ? 'serverSeed'
            : !clientSeed ? 'clientSeed'
                : !/^\d+$/.test(form.nonce.trim()) || !Number.isSafeInteger(nonce) ? 'nonce'
                    : form.game === 'mines' && !(Number.isInteger(mines) && mines >= 1 && mines <= 24) ? 'mines'
                        : !globalThis.crypto?.subtle ? 'crypto' : null
        if (problem) {
            setResult(null)
            return setError(t(`pages.verify.errors.${problem}`))
        }
        setBusy(true)
        setError('')
        try {
            const [hash, seedHash] = await Promise.all([roundHash(serverSeed, clientSeed, nonce), sha256(serverSeed)])
            const r = floatFromHash(hash)
            setResult({ game: form.game, hash, seedHash, r, ...describeRound(form.game, r, hash, { mines, difficulty: form.difficulty }) })
        } catch {
            setError(t('pages.verify.errors.crypto'))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Page title={t('pages.verify.title')} subtitle={t('pages.verify.subtitle')} narrow>
            <section className="panel" aria-labelledby="verify-how">
                <h2 id="verify-how">{t('pages.verify.howTitle')}</h2>
                <ol className="bullet-list">
                    {tRaw('pages.verify.how').map((step) => <li key={step}>{step}</li>)}
                </ol>
            </section>

            <section className="panel" aria-labelledby="verify-form">
                <h2 id="verify-form" className="visually-hidden">{t('pages.verify.title')}</h2>
                <form className="verify-form" onSubmit={submit} noValidate>
                    <label className="field">
                        {t('pages.verify.game')}
                        <select value={form.game} onChange={set('game')}>
                            {GAMES.map((game) => <option key={game} value={game}>{GAME_LABELS[game]}</option>)}
                        </select>
                    </label>
                    <label className="field">
                        {t('pages.verify.nonce')}
                        <input inputMode="numeric" value={form.nonce} onChange={set('nonce')} autoComplete="off" />
                    </label>
                    <label className="field field--wide">
                        {t('pages.verify.serverSeed')}
                        <input value={form.serverSeed} onChange={set('serverSeed')} autoComplete="off" spellCheck="false" />
                    </label>
                    <label className="field field--wide">
                        {t('pages.verify.clientSeed')}
                        <input value={form.clientSeed} onChange={set('clientSeed')} autoComplete="off" spellCheck="false" />
                    </label>
                    {form.game === 'mines' && (
                        <label className="field">
                            {t('pages.verify.mines')}
                            <input type="number" min="1" max="24" value={form.mines} onChange={set('mines')} />
                        </label>
                    )}
                    {form.game === 'dino' && (
                        <label className="field">
                            {t('pages.verify.difficulty')}
                            <select value={form.difficulty} onChange={set('difficulty')}>
                                {Object.keys(DINO_SURVIVAL).map((level) => <option key={level} value={level}>{t(`pages.verify.difficulties.${level}`)}</option>)}
                            </select>
                        </label>
                    )}
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <div className="field--wide">
                        <button type="submit" className="button button--primary" disabled={busy}>{t('pages.verify.submit')}</button>
                    </div>
                </form>
            </section>

            {result && (
                <section className="panel verify-result" aria-labelledby="verify-result" aria-live="polite">
                    <h2 id="verify-result">{t('pages.verify.resultTitle')}: {GAME_LABELS[result.game]}</h2>
                    <dl>
                        <div>
                            <dt>{t(`pages.verify.results.${result.game}`)}</dt>
                            <dd className="verify-result__main">
                                {result.positions ? <MinesBoard positions={result.positions} /> : result.main}
                            </dd>
                        </div>
                        <div><dt>{t('pages.verify.seedHash')}</dt><dd>{result.seedHash}</dd></div>
                        <div><dt>{t('pages.verify.hmac')}</dt><dd>{result.hash}</dd></div>
                        <div><dt>{t('pages.verify.float')}</dt><dd>{formatNumber(result.r, 10)}</dd></div>
                    </dl>
                </section>
            )}

            <p className="muted">{t('pages.verify.plinkoNote')}</p>
            <p className="muted">{t('pages.verify.disclaimer')}</p>
        </Page>
    )
}
