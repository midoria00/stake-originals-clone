import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useGameList } from '../casino/api'
import { CatalogGrid } from '../casino/components'
import { GameGrid } from '../components/GameCard'
import Page, { EmptyState } from '../components/Page'
import { getGame } from '../games'
import { t } from '../i18n'
import { formatDateTime } from '../i18n/format'
import { useRecentGames } from '../lib/storage'

export default function RecentPage() {
    const recent = useRecentGames()
    const originals = recent.items.filter((item) => getGame(item.id))
    // Catalog games are stored as "provider:externalId" and looked up on the server, newest first.
    const catalogIds = recent.items.filter((item) => item.id.includes(':')).map((item) => item.id)
    const catalog = useGameList({ ids: catalogIds.join(','), skip: catalogIds.length === 0 })
    const openedAt = new Map(recent.items.map((item) => [item.id, item.at]))
    const openedText = (id) => t('pages.recent.openedAt', { date: formatDateTime(openedAt.get(id)) })
    const empty = originals.length === 0 && catalogIds.length === 0

    return (
        <Page
            title={t('pages.recent.title')}
            subtitle={t('pages.recent.subtitle')}
            actions={!empty && <button type="button" className="button button--ghost button--small" onClick={recent.clear}>{t('pages.recent.clear')}</button>}
        >
            {empty && <EmptyState icon={Clock} text={t('pages.recent.empty')} action={<Link className="button button--primary" to="/cassino">{t('pages.favorites.seeGames')}</Link>} />}
            {originals.length > 0 && (
                <section className="page-section" aria-labelledby="recent-originals">
                    <div className="page-section__head"><h2 id="recent-originals">{t('pages.recent.originals')}</h2></div>
                    <GameGrid games={originals.map((item) => getGame(item.id))} metaFor={(game) => openedText(game.id)} />
                </section>
            )}
            {catalogIds.length > 0 && (
                <section className="page-section" aria-labelledby="recent-catalog">
                    <div className="page-section__head"><h2 id="recent-catalog">{t('pages.recent.providerGames')}</h2></div>
                    <CatalogGrid list={catalog} emptyText={t('pages.favorites.providerGamesGone')} metaFor={(game) => openedText(game.id)} />
                </section>
            )}
        </Page>
    )
}
