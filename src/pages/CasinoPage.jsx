import { Link, useSearchParams } from 'react-router-dom'
import { Clock, Star } from 'lucide-react'
import { PROVIDERS } from '../../server/casino/providers.js'
import { useProviderStatuses } from '../casino/api'
import { ProviderGrid } from '../casino/components'
import { GameGrid } from '../components/GameCard'
import Page, { Chips, EmptyState } from '../components/Page'
import { GAMES, getGame } from '../games'
import { t } from '../i18n'
import { useFavoriteGames, useRecentGames } from '../lib/storage'

const FILTERS = ['all', 'favoritos', 'recentes']

export default function CasinoPage() {
    const [params, setParams] = useSearchParams()
    const filter = FILTERS.includes(params.get('filtro')) ? params.get('filtro') : 'all'
    const favorites = useFavoriteGames()
    const recent = useRecentGames()
    const favoriteGames = favorites.ids.map(getGame).filter(Boolean)
    const recentGames = recent.items.map((item) => getGame(item.id)).filter(Boolean)
    const games = { all: GAMES, favoritos: favoriteGames, recentes: recentGames }[filter]
    const statuses = useProviderStatuses()
    const rows = statuses.data ? new Map(statuses.data.providers.map((row) => [row.id, row])) : null

    return (
        <Page
            title={t('pages.casino.title')}
            subtitle={t('pages.casino.subtitle')}
            actions={<Link className="button button--ghost button--small" to="/cassino/jogos">{t('casino.allGamesTitle')}</Link>}
        >
            <Chips
                label={t('pages.casino.filterLabel')}
                value={filter}
                onChange={(value) => setParams(value === 'all' ? {} : { filtro: value }, { replace: true })}
                options={[
                    { value: 'all', label: t('pages.casino.all'), count: GAMES.length },
                    { value: 'favoritos', label: t('pages.casino.favorites'), count: favoriteGames.length },
                    { value: 'recentes', label: t('pages.casino.recent'), count: recentGames.length },
                ]}
            />
            {games.length
                ? <GameGrid games={games} />
                : <EmptyState icon={filter === 'favoritos' ? Star : Clock} text={t(filter === 'favoritos' ? 'pages.casino.emptyFavorites' : 'pages.casino.emptyRecent')} />}
            <section className="page-section" aria-labelledby="casino-providers">
                <div className="page-section__head">
                    <h2 id="casino-providers">{t('nav.providers')}</h2>
                    <Link to="/cassino/provedores">{t('casino.seeAllProviders')}</Link>
                </div>
                <ProviderGrid providers={PROVIDERS.slice(0, 6)} rows={rows} />
            </section>
        </Page>
    )
}
