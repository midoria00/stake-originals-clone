import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Dices } from 'lucide-react'
import Page, { Chips, EmptyState } from '../components/Page'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { formatCoins, formatDateTime } from '../i18n/format'
import { BetList } from '../sports/BetSlip'
import { useBetSlip } from '../sports/BetSlipContext'

const PAGE_SIZE = 50
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

export default function MyBetsPage() {
    const [params, setParams] = useSearchParams()
    const { bets } = useBetSlip()
    const { history } = useWallet()
    const tab = params.get('aba') === 'cassino' ? 'cassino' : 'futebol'
    const status = params.get('status') === 'encerradas' ? 'encerradas' : 'abertas'
    const open = bets.filter((bet) => bet.status === 'pending').length
    const update = (changes) => setParams({ aba: tab, status, ...changes }, { replace: true })

    return (
        <Page title={t('pages.myBets.title')} subtitle={t('pages.myBets.subtitle')}>
            <Chips
                label={t('pages.myBets.title')}
                value={tab}
                onChange={(value) => update({ aba: value })}
                options={[
                    { value: 'futebol', label: t('pages.myBets.sports'), count: bets.length },
                    { value: 'cassino', label: t('pages.myBets.casino'), count: history.filter(isCasinoEntry).length },
                ]}
            />
            {tab === 'futebol' ? (
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
                    <p><Link className="button button--ghost" to="/sports">{t('pages.myBets.seeMatches')}</Link></p>
                </>
            ) : <CasinoHistory />}
        </Page>
    )
}
