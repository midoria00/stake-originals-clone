import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { t } from '../i18n'
import { useFavoriteGames } from '../lib/storage'
import { GameIcon } from './icons'
import './GameCard.css'

const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000

export const isNewGame = (game, now = Date.now()) => now - Date.parse(`${game.addedAt}T00:00:00-03:00`) < NEW_FOR_MS

export function GameCard({ game, meta }) {
    const favorites = useFavoriteGames()
    const favorite = favorites.has(game.id)
    return (
        <article className="game-card">
            <Link to={game.path} className="game-card__link">
                <span className="game-card__art">
                    <img src={game.image} alt="" width="320" height="400" loading="lazy" decoding="async" />
                </span>
                <span className="game-card__body">
                    <span className="game-card__name">
                        <GameIcon id={game.id} size={16} />
                        {game.navLabel}
                    </span>
                    <span className="game-card__summary">{meta ?? t(`games.${game.id}.summary`)}</span>
                </span>
            </Link>
            {isNewGame(game) && <span className="game-card__badge">{t('home.newBadge')}</span>}
            <button
                type="button"
                className={`game-card__fav${favorite ? ' is-on' : ''}`}
                aria-pressed={favorite}
                aria-label={`${favorite ? t('common.unfavorite') : t('common.favorite')}: ${game.navLabel}`}
                title={favorite ? t('common.unfavorite') : t('common.favorite')}
                onClick={() => favorites.toggle(game.id)}
            >
                <Star size={16} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
            </button>
        </article>
    )
}

export function GameGrid({ games, metaFor, compact = false }) {
    return (
        <div className={`game-grid${compact ? ' game-grid--compact' : ''}`}>
            {games.map((game) => <GameCard key={game.id} game={game} meta={metaFor?.(game)} />)}
        </div>
    )
}
