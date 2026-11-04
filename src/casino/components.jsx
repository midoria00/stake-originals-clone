import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { getProvider } from '../../server/casino/providers.js'
import { t } from '../i18n'
import { useFavoriteGames } from '../lib/storage'
import '../components/GameCard.css'
import './casino.css'

// Provider cards show the name in 123bet's own type, never a provider logo: no provider grants
// third parties a licence for its brand assets (docs/casino-providers-research.md).
export function providerStatusText(row) {
    if (!row) return t('casino.status.loading')
    if (row.status.executable) return t('casino.status.executable', { count: row.executableGames })
    if (row.status.integrated) return t('casino.status.integrated')
    return t('casino.status.pending')
}

export function ProviderCard({ provider, row }) {
    return (
        <Link to={`/cassino/provedores/${provider.id}`} className="provider-card">
            <span className="provider-card__name">{provider.name}</span>
            <span className={`provider-card__status${row?.status.executable ? ' is-on' : ''}`}>{providerStatusText(row)}</span>
        </Link>
    )
}

// `rows` are server statuses keyed by id; until they arrive the cards still render from the registry.
export function ProviderGrid({ providers, rows }) {
    return (
        <div className="provider-grid-wrap">
            <ul className="provider-grid">
                {providers.map((provider) => (
                    <li key={provider.id}><ProviderCard provider={provider} row={rows?.get(provider.id)} /></li>
                ))}
            </ul>
        </div>
    )
}

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

function GameArt({ game }) {
    if (!game.image?.src) return <span className="catalog-card__placeholder" aria-hidden="true">{initials(game.name)}</span>
    return (
        <picture>
            {game.image.avif && <source srcSet={game.image.avif} type="image/avif" />}
            {game.image.webp && <source srcSet={game.image.webp} type="image/webp" />}
            <img src={game.image.src} alt="" width="320" height="400" loading="lazy" decoding="async" />
        </picture>
    )
}

export function gameHref(game) {
    return game.internalPath ?? `/cassino/jogo/${encodeURIComponent(game.id)}`
}

// In-house favourites keep their short ids ("crash") so existing favourites still work.
export const favoriteId = (game) => (game.provider === '123bet' ? game.externalId : game.id)

function badge(game) {
    if (game.provider === '123bet') return { text: t('casino.inHouseBadge'), tone: 'brand' }
    if (game.availability === 'unavailable') return { text: t('casino.unavailableBadge'), tone: 'muted' }
    if (game.launchable) return { text: t('casino.demoBadge'), tone: 'ok' }
    return { text: t('casino.catalogOnlyBadge'), tone: 'muted' }
}

export function CatalogGameCard({ game }) {
    const favorites = useFavoriteGames()
    const id = favoriteId(game)
    const favorite = favorites.has(id)
    const tag = badge(game)
    const providerName = getProvider(game.provider)?.name ?? game.provider
    return (
        <article className="catalog-card">
            <Link to={gameHref(game)} className="catalog-card__link">
                <span className="catalog-card__art"><GameArt game={game} /></span>
                <span className="catalog-card__body">
                    <span className="catalog-card__name">{game.name}</span>
                    <span className="catalog-card__meta">{providerName} · {t(`casino.categories.${game.category}`)}</span>
                </span>
            </Link>
            <span className={`catalog-card__badge is-${tag.tone}`}>{tag.text}</span>
            <button
                type="button"
                className={`game-card__fav${favorite ? ' is-on' : ''}`}
                aria-pressed={favorite}
                aria-label={`${favorite ? t('common.unfavorite') : t('common.favorite')}: ${game.name}`}
                title={favorite ? t('common.unfavorite') : t('common.favorite')}
                onClick={() => favorites.toggle(id)}
            >
                <Star size={16} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
            </button>
        </article>
    )
}

function Sentinel({ onVisible, active }) {
    const ref = useRef(null)
    useEffect(() => {
        if (!active || !ref.current || typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && onVisible(), { rootMargin: '600px 0px' })
        observer.observe(ref.current)
        return () => observer.disconnect()
    }, [onVisible, active])
    return <div ref={ref} className="catalog-sentinel" aria-hidden="true" />
}

// Paged grid: skeletons on the first page, then automatic loading near the end plus a manual button.
export function CatalogGrid({ list, emptyText }) {
    if (list.error && !list.items.length) {
        return (
            <div className="state-panel state-panel--error" role="alert">
                <p>{list.error.message}</p>
                <button type="button" className="button button--primary" onClick={list.reload}>{t('common.retry')}</button>
            </div>
        )
    }
    if (!list.loading && !list.items.length) return <div className="empty-state"><p>{emptyText}</p></div>
    return (
        <>
            <div className="catalog-grid" aria-busy={list.loading}>
                {list.items.map((game) => <CatalogGameCard key={game.id} game={game} />)}
                {list.loading && Array.from({ length: list.items.length ? 4 : 8 }, (_, index) => <span key={`s${index}`} className="skeleton catalog-skeleton" aria-hidden="true" />)}
            </div>
            {list.hasMore && (
                <div className="catalog-more">
                    <Sentinel onVisible={list.loadMore} active={!list.loading} />
                    <button type="button" className="button button--ghost" onClick={list.loadMore} disabled={list.loading}>
                        {list.loading ? t('casino.loadingMore') : t('casino.loadMore')}
                    </button>
                </div>
            )}
            {list.error && list.items.length > 0 && <p className="form-error" role="alert">{list.error.message}</p>}
        </>
    )
}

// Honest counts from the server: registered, integrated and with an executable demo.
export function TotalsLine({ state }) {
    const { data, error } = state
    return (
        <p className="catalog-summary" aria-live="polite">
            {data ? t('casino.totals', data.totals) : error ? t('casino.totalsError') : t('casino.totalsLoading')}
        </p>
    )
}
