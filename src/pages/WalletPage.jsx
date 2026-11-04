import { useState } from 'react'
import { Coins } from '../brand/Brand'
import { useFreeCredits } from '../components/Header'
import Page, { useConfirm } from '../components/Page'
import { useWallet } from '../context/WalletContext'
import { t, tRaw } from '../i18n'
import { formatCoins, formatDateTime, formatNumber, formatPercent } from '../i18n/format'
import { FREE_CREDIT_OPTIONS, FREE_CREDITS_CEILING, INITIAL_BALANCE } from '../wallet/ledger'

const PAGE_SIZE = 20
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCoins(Math.abs(value))}`
const tone = (value) => (value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : '')
// Money leaving the balance shows as negative; a reset shows the new balance.
const entrySign = (entry) => (entry.type === 'bet' ? '−' : entry.type === 'reset' || entry.type === 'migration' ? '' : '+')

export default function WalletPage() {
    const { balance, history, stats, resetBalance, showToast } = useWallet()
    const addFree = useFreeCredits()
    const confirm = useConfirm()
    const [limit, setLimit] = useState(PAGE_SIZE)
    const net = stats.returned - stats.wagered
    const sources = Object.entries(stats.bySource).filter(([, s]) => s.bets > 0).sort((a, b) => b[1].wagered - a[1].wagered)

    const askReset = () => confirm({
        title: t('wallet.resetConfirmTitle'),
        content: t('wallet.resetConfirmBody', { amount: formatNumber(INITIAL_BALANCE) }),
        okText: t('wallet.reset', { amount: formatNumber(INITIAL_BALANCE) }),
        onOk: () => {
            resetBalance()
            showToast('win', t('wallet.resetDone'), `${formatNumber(INITIAL_BALANCE)} ${t('common.coins')}`)
        },
    })

    return (
        <Page title={t('wallet.title')} subtitle={t('pages.wallet.subtitle')}>
            <div className="wallet-hero">
                <section className="panel wallet-balance" aria-labelledby="wallet-balance">
                    <p className="muted" id="wallet-balance">{t('wallet.balance')}</p>
                    <p className="wallet-balance__value"><Coins value={balance} size={30} /></p>
                    <h2>{t('wallet.addFree')}</h2>
                    <div className="chip-row">
                        {FREE_CREDIT_OPTIONS.map((amount) => (
                            <button key={amount} type="button" className="button button--primary button--small" onClick={() => addFree(amount)}>
                                {t('wallet.addAmount', { amount: formatNumber(amount) })}
                            </button>
                        ))}
                    </div>
                    <p className="muted">{t('pages.wallet.freeHint', { limit: formatNumber(FREE_CREDITS_CEILING) })}</p>
                </section>
                <section className="panel" aria-labelledby="wallet-rules">
                    <h2 id="wallet-rules">{t('pages.wallet.rulesTitle')}</h2>
                    <ul className="bullet-list">
                        {tRaw('pages.wallet.rules').map((rule) => <li key={rule}>{rule}</li>)}
                    </ul>
                    <div className="settings-row">
                        <div>
                            <strong>{t('pages.wallet.resetTitle')}</strong>
                            <p className="muted">{t('pages.wallet.resetHint', { amount: formatNumber(INITIAL_BALANCE) })}</p>
                        </div>
                        <button type="button" className="button button--ghost" onClick={askReset}>{t('wallet.reset', { amount: formatNumber(INITIAL_BALANCE) })}</button>
                    </div>
                </section>
            </div>

            <section className="page-section" aria-labelledby="wallet-performance">
                <div className="page-section__head"><h2 id="wallet-performance">{t('wallet.performance')}</h2></div>
                {stats.bets === 0 ? <p className="muted">{t('wallet.noStats')}</p> : (
                    <dl className="stat-grid">
                        <div className="stat"><dt>{t('wallet.wagered')}</dt><dd><Coins value={stats.wagered} /></dd></div>
                        <div className="stat"><dt>{t('wallet.returned')}</dt><dd><Coins value={stats.returned} /></dd></div>
                        <div className="stat"><dt>{t('wallet.net')}</dt><dd className={tone(net)}>{signed(net)}</dd></div>
                        <div className="stat"><dt>{t('wallet.returnRate')}</dt><dd>{formatPercent(stats.returned / stats.wagered)}</dd></div>
                        <div className="stat"><dt>{t('wallet.betsCount')}</dt><dd>{formatNumber(stats.bets)}</dd></div>
                        <div className="stat"><dt>{t('wallet.biggestPayout')}</dt><dd><Coins value={stats.biggestPayout} /></dd></div>
                        <div className="stat"><dt>{t('wallet.freeCredits')}</dt><dd><Coins value={stats.freeCredits} /></dd></div>
                    </dl>
                )}
            </section>

            {sources.length > 0 && (
                <section className="page-section" aria-labelledby="wallet-by-game">
                    <div className="page-section__head"><h2 id="wallet-by-game">{t('wallet.bySource')}</h2></div>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t('pages.wallet.columns.game')}</th>
                                    <th scope="col" className="num">{t('pages.wallet.columns.bets')}</th>
                                    <th scope="col" className="num">{t('pages.wallet.columns.wagered')}</th>
                                    <th scope="col" className="num">{t('pages.wallet.columns.returned')}</th>
                                    <th scope="col" className="num">{t('pages.wallet.columns.net')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sources.map(([source, s]) => (
                                    <tr key={source}>
                                        <th scope="row">{t(`wallet.sources.${source}`)}</th>
                                        <td className="num">{formatNumber(s.bets)}</td>
                                        <td className="num">{formatCoins(s.wagered)}</td>
                                        <td className="num">{formatCoins(s.returned)}</td>
                                        <td className={`num ${tone(s.returned - s.wagered)}`}>{signed(s.returned - s.wagered)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section className="page-section" aria-labelledby="wallet-history">
                <div className="page-section__head">
                    <h2 id="wallet-history">{t('wallet.history')}</h2>
                    {history.length > 0 && <p>{t('pages.wallet.shown', { shown: formatNumber(Math.min(limit, history.length)), total: formatNumber(history.length) })}</p>}
                </div>
                {history.length === 0 ? <p className="muted">{t('wallet.historyEmpty')}</p> : (
                    <>
                        <ul className="plain-list">
                            {history.slice(0, limit).map((entry) => (
                                <li key={entry.id}>
                                    <span>
                                        <strong>{t(`wallet.types.${entry.type}`)}</strong> · {t(`wallet.sources.${entry.source}`)}
                                        <br />
                                        <time className="muted" dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                                    </span>
                                    <span>
                                        <strong className={entry.type === 'bet' ? 'is-negative' : entry.type === 'win' || entry.type === 'refill' ? 'is-positive' : ''}>
                                            {entrySign(entry)}{formatCoins(entry.amount)}
                                        </strong>
                                        <br />
                                        <span className="muted">{t('pages.wallet.balanceAfter', { amount: formatCoins(entry.balance) })}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {history.length > limit && (
                            <p><button type="button" className="button button--ghost" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t('wallet.showMore')}</button></p>
                        )}
                    </>
                )}
            </section>
        </Page>
    )
}
