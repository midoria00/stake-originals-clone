import { Link } from 'react-router-dom'
import { Star, Trophy, X } from 'lucide-react'
import { GameGrid } from '../components/GameCard'
import Page, { EmptyState } from '../components/Page'
import { getGame } from '../games'
import { t } from '../i18n'
import { useFavoriteGames, useFavoriteLeagues } from '../lib/storage'

export default function FavoritesPage() {
    const favorites = useFavoriteGames()
    const leagues = useFavoriteLeagues()
    const games = favorites.ids.map(getGame).filter(Boolean)

    return (
        <Page title={t('pages.favorites.title')} subtitle={t('pages.favorites.subtitle')}>
            <section className="page-section" aria-labelledby="fav-games">
                <div className="page-section__head">
                    <h2 id="fav-games">{t('pages.favorites.games')}</h2>
                    {games.length > 0 && <button type="button" className="button button--ghost button--small" onClick={favorites.clear}>{t('pages.favorites.clearGames')}</button>}
                </div>
                {games.length
                    ? <GameGrid games={games} />
                    : <EmptyState icon={Star} text={t('pages.favorites.emptyGames')} action={<Link className="button button--primary" to="/cassino">{t('pages.favorites.seeGames')}</Link>} />}
            </section>

            <section className="page-section" aria-labelledby="fav-leagues">
                <div className="page-section__head">
                    <h2 id="fav-leagues">{t('pages.favorites.leagues')}</h2>
                    {leagues.items.length > 0 && <button type="button" className="button button--ghost button--small" onClick={leagues.clear}>{t('pages.favorites.clearLeagues')}</button>}
                </div>
                {leagues.items.length ? (
                    <ul className="plain-list">
                        {leagues.items.map((league) => (
                            <li key={league.id}>
                                <Link to={`/sports?league=${encodeURIComponent(league.id)}`}><Trophy size={16} aria-hidden="true" />{league.name}</Link>
                                <button type="button" className="icon-button" aria-label={`${t('common.unfavorite')}: ${league.name}`} onClick={() => leagues.toggle(league)}>
                                    <X size={16} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : <EmptyState icon={Trophy} text={t('pages.favorites.emptyLeagues')} action={<Link className="button button--primary" to="/sports">{t('pages.favorites.seeSports')}</Link>} />}
            </section>
        </Page>
    )
}
