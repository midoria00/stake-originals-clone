import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Dices } from 'lucide-react'
import { accountApi, errorMessage } from '../account/api'
import Page, { Chips, EmptyState } from '../components/Page'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { formatCoins, formatDateTime } from '../i18n/format'
import { BetCards, BetList } from '../sports/BetSlip'
import { useBetSlip } from '../sports/BetSlipContext'
import { fromServerBet } from '../sports/serverBets'

const PAGE_SIZE = 50
const SERVER_STATUSES = ['open', 'won', 'lost', 'void', 'partial']
const isCasinoEntry = (entry) => (entry.type === 'bet' || entry.type === 'win') && entry.source !== 'sports'

function CasinoHistory() {
    const { history } = useWallet()
    const [limit, setLimit] = useState(PAGE_SIZE)
    const entries = history.filter(isCasinoEntry)
    if (!entries.length) {
        return <EmptyState icon={Dices} text={t('pages.myBets.emptyCasino')} action={<Link className="button button--primary" to="/cassino">{t('pages.myBets.seeGames')}</Link>} />
    }
    return (
        <>
            <p className="muted">{t('pages.myBets.casinoNote')}</p>
            <div className="table-wrap">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th scope="col">{t('pages.myBets.columns.when')}</th>
                            <th scope="col">{t('pages.myBets.columns.game')}</th>
                            <th scope="col">{t('pages.myBets.columns.type')}</th>
                            <th scope="col" className="num">{t('pages.myBets.columns.amount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.slice(0, limit).map((entry) => (
                            <tr key={entry.id}>
                                <td><time dateTime={entry.at}>{formatDateTime(entry.at)}</time></td>
                                <td>{t(`wallet.sources.${entry.source}`)}</td>
                                <td>{t(`wallet.types.${entry.type}`)}</td>
                                <td className={`num ${entry.type === 'bet' ? 'is-negative' : 'is-positive'}`}>
                                    {entry.type === 'bet' ? '−' : '+'}{formatCoins(entry.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {entries.length > limit && (
                <p><button type="button" className="button button--ghost" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t('wallet.showMore')}</button></p>
            )}
        </>
    )
}

// Signed-in players: bets live on the server (listing also settles finished matches), paged by cursor.
function ServerBets({ status }) {
    const { syncWallet } = useWallet()
    const walletSync = useRef(syncWallet)
    walletSync.current = syncWallet
    const request = useRef(0)
    const [state, setState] = useState({ items: [], next: null, loading: true, error: null })

    const load = useCallback(async (cursor) => {
        const id = ++request.current
        setState((previous) => ({ ...previous, loading: true, error: null }))
        try {
            const res = await accountApi.sportsBets({ status: status === 'all' ? undefined : status, cursor, limit: 25 })
            if (id !== request.current) return
            const items = res.items.map(fromServerBet)
            setState((previous) => ({ items: cursor ? [...previous.items, ...items] : items, next: res.nextCursor, loading: false, error: null }))
            // Settling happens while listing, so refresh the balance too.
            if (!cursor) accountApi.wallet().then((data) => data?.wallet && walletSync.current(data.wallet)).catch(() => {})
        } catch (error) {
            if (id === request.current) setState((previous) => ({ ...previous, loading: false, error: errorMessage(error) }))
        }
    }, [status])

    useEffect(() => { load(null) }, [load])

    return (
        <div className="my-bets">
            {state.error && <p className="sp-msg sp-msg--error" role="alert">{state.error}</p>}
            {state.items.length > 0 && <BetCards bets={state.items} />}
            {!state.items.length && !state.loading && !state.error && (
                <div className="sp-slip__empty"><p>{t(status === 'open' ? 'pages.myBets.emptyOpen' : status === 'all' ? 'pages.myBets.emptySettled' : 'pages.myBets.emptyFilter')}</p></div>
            )}
            {state.loading && <p className="muted" role="status">{t('pages.myBets.loading')}</p>}
            {state.next && !state.loading && (
                <p><button type="button" className="button button--ghost" onClick={() => load(state.next)}>{t('pages.myBets.loadMore')}</button></p>
            )}
        </div>
    )
}

export default function MyBetsPage() {
    const [params, setParams] = useSearchParams()
    const { bets } = useBetSlip()
    const { history, mode } = useWallet()
    const server = mode === 'server'
    const tab = params.get('aba') === 'cassino' ? 'cassino' : 'futebol'
    const status = params.get('status') === 'encerradas' ? 'encerradas' : 'abertas'
    const serverStatus = SERVER_STATUSES.includes(params.get('status')) || params.get('status') === 'all' ? params.get('status') : 'open'
    const open = bets.filter((bet) => bet.status === 'pending').length
    const update = (changes) => setParams({ aba: tab, status: server ? serverStatus : status, ...changes }, { replace: true })

    return (
        <Page title={t('pages.myBets.title')} subtitle={t('pages.myBets.subtitle')}>
            <Chips
                label={t('pages.myBets.title')}
                value={tab}
                onChange={(value) => update({ aba: value })}
                options={[
                    { value: 'futebol', label: t('pages.myBets.sports'), count: server ? undefined : bets.length },
                    { value: 'cassino', label: t('pages.myBets.casino'), count: history.filter(isCasinoEntry).length },
                ]}
            />
            {tab === 'futebol' ? (
                <>
                    {server ? (
                        <>
                            <Chips
                                label={t('pages.myBets.sports')}
                                value={serverStatus}
                                onChange={(value) => update({ status: value })}
                                options={[
                                    { value: 'all', label: t('pages.myBets.all') },
                                    ...SERVER_STATUSES.map((value) => ({ value, label: t(`sports.results.${value === 'open' ? 'pending' : value}`) })),
                                ]}
                            />
                            <ServerBets status={serverStatus} />
                        </>
                    ) : (
                        <>
                            <Chips
                                label={t('pages.myBets.sports')}
                                value={status}
                                onChange={(value) => update({ status: value })}
                                options={[
                                    { value: 'abertas', label: t('pages.myBets.open'), count: open },
                                    { value: 'encerradas', label: t('pages.myBets.settled'), count: bets.length - open },
                                ]}
                            />
                            <div className="my-bets">
                                <BetList
                                    status={status === 'abertas' ? 'open' : 'settled'}
                                    emptyText={t(status === 'abertas' ? 'pages.myBets.emptyOpen' : 'pages.myBets.emptySettled')}
                                />
                            </div>
                        </>
                    )}
                    <p><Link className="button button--ghost" to="/sports">{t('pages.myBets.seeMatches')}</Link></p>
                </>
            ) : <CasinoHistory />}
        </Page>
    )
}
