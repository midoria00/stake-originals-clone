import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { GameGrid } from '../components/GameCard'
import Page, { EmptyState } from '../components/Page'
import { getGame } from '../games'
import { t } from '../i18n'
import { formatDateTime } from '../i18n/format'
import { useRecentGames } from '../lib/storage'

export default function RecentPage() {
    const recent = useRecentGames()
    const items = recent.items.filter((item) => getGame(item.id))
    const openedAt = new Map(items.map((item) => [item.id, item.at]))

    return (
        <Page
            title={t('pages.recent.title')}
            subtitle={t('pages.recent.subtitle')}
            actions={items.length > 0 && <button type="button" className="button button--ghost button--small" onClick={recent.clear}>{t('pages.recent.clear')}</button>}
        >
            {items.length
                ? <GameGrid games={items.map((item) => getGame(item.id))} metaFor={(game) => t('pages.recent.openedAt', { date: formatDateTime(openedAt.get(game.id)) })} />
                : <EmptyState icon={Clock} text={t('pages.recent.empty')} action={<Link className="button button--primary" to="/cassino">{t('pages.favorites.seeGames')}</Link>} />}
        </Page>
    )
}
