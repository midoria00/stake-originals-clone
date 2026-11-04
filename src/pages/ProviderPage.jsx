import { Link, useParams } from 'react-router-dom'
import { getProvider, PROVIDERS } from '../../server/casino/providers.js'
import { useGameList, useProviderStatuses } from '../casino/api'
import { CatalogGrid } from '../casino/components'
import Page from '../components/Page'
import { t } from '../i18n'

function Situation({ row }) {
    if (!row) return <p className="muted">{t('casino.status.loading')}</p>
    const { integrated, executable } = row.status
    return (
        <>
            <ul className="status-list">
                <li className="status-pill is-on">{t('casino.status.registered')}</li>
                <li className={`status-pill${integrated ? ' is-on' : ''}`}>{integrated ? t('casino.status.integrated') : t('casino.status.pending')}</li>
                <li className={`status-pill${executable ? ' is-on' : ''}`}>{executable ? t('casino.status.executable', { count: row.executableGames }) : t('casino.status.noDemo')}</li>
            </ul>
            <p>{integrated ? t('casino.providerPage.integratedBody') : t('casino.providerPage.pendingBody')}</p>
            <p>{executable ? t('casino.providerPage.executableBody', { count: row.executableGames }) : t('casino.providerPage.notExecutableBody')}</p>
            <p className="muted">{row.games ? t('casino.gamesCount', { count: row.games }) : t('casino.noGamesCount')}</p>
        </>
    )
}

export default function ProviderPage() {
    const { slug } = useParams()
    const provider = PROVIDERS.find((item) => item.id === slug)
    const statuses = useProviderStatuses()
    const list = useGameList({ provider: provider?.id, sort: 'featured', skip: !provider })

    if (!provider) {
        return (
            <div className="state-panel">
                <h1>{t('casino.providerPage.notFound')}</h1>
                <Link className="button button--primary" to="/cassino/provedores">{t('casino.providerPage.back')}</Link>
            </div>
        )
    }
    const row = statuses.data?.providers.find((item) => item.id === provider.id)
    const group = provider.group ? getProvider(provider.group)?.name : null

    return (
        <Page
            title={provider.name}
            subtitle={group ? t('casino.providerPage.partOf', { group }) : t('casino.providerPage.registeredBody')}
            actions={<Link className="button button--ghost button--small" to="/cassino/provedores">{t('casino.providerPage.back')}</Link>}
        >
            <section className="panel" aria-labelledby="provider-situation">
                <h2 id="provider-situation">{t('casino.providerPage.situation')}</h2>
                {statuses.error ? <p>{t('casino.totalsError')}</p> : <Situation row={row} />}
            </section>
            <section className="page-section" aria-labelledby="provider-games">
                <div className="page-section__head"><h2 id="provider-games">{t('casino.providerPage.gamesTitle')}</h2></div>
                <CatalogGrid list={list} emptyText={t('casino.providerPage.emptyGames')} />
            </section>
        </Page>
    )
}
