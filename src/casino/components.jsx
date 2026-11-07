import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { getProvider } from '../../server/casino/providers.js'
import { t } from '../i18n'
import { useFavoriteGames } from '../lib/storage'
import { PAGE } from './api'
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

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join('').toUpperCase()

// Cards without an authorized cover get a tinted panel with the initials: clearly a placeholder,
// never a picture presented as the game's art. The tint only separates providers at a glance.
const PROVIDER_HUES = { 'pg-soft': 16, 'pragmatic-play': 38, 'hacksaw-gaming': 196, bgaming: 268, 'booming-games': 330, habanero: 148, 'tada-gaming': 52, '123bet': 210 }
const providerHue = (provider) => PROVIDER_HUES[provider] ?? [...provider].reduce((hue, char) => (hue * 31 + char.charCodeAt(0)) % 360, 7)

function ArtFallback({ game }) {
    return (
        <span className="catalog-art-fallback" style={{ '--art-hue': providerHue(game.provider) }} data-art="fallback" aria-hidden="true">
            <span className="catalog-art-fallback__initials">{initials(game.name)}</span>
        </span>
    )
}

// Authorized cover (AVIF/WebP when offered), lazy and with a fixed box so nothing shifts while it
// loads; a broken or missing file falls back to the placeholder.
export function GameArt({ game, eager = false }) {
    const [failed, setFailed] = useState(false)
    const image = game.image
    if (!image?.src || failed) return <ArtFallback game={game} />
    return (
        <picture data-art="cover">
            {image.avif && <source srcSet={image.avif} type="image/avif" />}
            {image.webp && <source srcSet={image.webp} type="image/webp" />}
            <img
                src={image.src}
                alt=""
                width={image.width ?? 320}
                height={image.height ?? 400}
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                fetchpriority={eager ? 'high' : undefined}
                onError={() => setFailed(true)}
            />
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

// Memoized: the grid owns the favourites subscription, so toggling one star re-renders one card
// instead of every card on the page (up to the whole catalog after scrolling).
export const CatalogGameCard = memo(function CatalogGameCard({ game, favorite, onToggleFavorite, meta }) {
    const tag = badge(game)
    const providerName = getProvider(game.provider)?.name ?? game.provider
    return (
        <article className="catalog-card">
            <Link to={gameHref(game)} className="catalog-card__link">
                <span className="catalog-card__art"><GameArt game={game} /></span>
                <span className="catalog-card__body">
                    <span className="catalog-card__name" title={game.name}>{game.name}</span>
                    <span className="catalog-card__meta">{meta ?? `${providerName} · ${t(`casino.categories.${game.category}`)}`}</span>
                </span>
            </Link>
            <span className={`catalog-card__badge is-${tag.tone}`}>{tag.text}</span>
            <button
                type="button"
                className={`game-card__fav${favorite ? ' is-on' : ''}`}
                aria-pressed={favorite}
                aria-label={`${favorite ? t('common.unfavorite') : t('common.favorite')}: ${game.name}`}
                title={favorite ? t('common.unfavorite') : t('common.favorite')}
                onClick={() => onToggleFavorite(favoriteId(game))}
            >
                <Star size={16} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
            </button>
        </article>
    )
})

// Same structure and box as a card, so swapping skeletons for cards moves nothing.
function CardSkeleton() {
    return (
        <span className="catalog-card catalog-card--skeleton" aria-hidden="true">
            <span className="catalog-card__link">
                <span className="catalog-card__art skeleton" />
                <span className="catalog-card__body">
                    <span className="catalog-card__name"><span className="skeleton catalog-card__bar">&nbsp;</span></span>
                    <span className="catalog-card__meta"><span className="skeleton catalog-card__bar catalog-card__bar--short">&nbsp;</span></span>
                </span>
            </span>
        </span>
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

// While a page loads, reserve exactly the cards it will bring (the total is known after the first
// page), so the arriving cards replace skeletons one for one and nothing below them jumps.
const pendingCards = (list) => {
    if (!list.loading) return 0
    if (list.total === null || !list.items.length) return 8
    return Math.max(0, Math.min(PAGE, list.total - list.items.length))
}

// Paged grid: skeletons on the first page, then automatic loading near the end plus a manual button.
// `metaFor(game)` replaces the provider line (e.g. "opened at" on Recentes).
export function CatalogGrid({ list, emptyText, metaFor }) {
    const favorites = useFavoriteGames()
    const favoriteIds = useMemo(() => new Set(favorites.ids), [favorites.ids])
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
                {list.items.map((game) => (
                    <CatalogGameCard key={game.id} game={game} favorite={favoriteIds.has(favoriteId(game))} onToggleFavorite={favorites.toggle} meta={metaFor?.(game)} />
                ))}
                {Array.from({ length: pendingCards(list) }, (_, index) => <CardSkeleton key={`s${index}`} />)}
            </div>
            {/* Hidden while a page loads: the reserved skeletons take its place, so the button is not
                pushed down in view (a layout shift); it comes back after the cards. */}
            {list.hasMore && !list.loading && (
                <div className="catalog-more">
                    <Sentinel onVisible={list.loadMore} active />
                    <button type="button" className="button button--ghost" onClick={list.loadMore}>{t('casino.loadMore')}</button>
                </div>
            )}
            {list.loading && list.items.length > 0 && <p className="visually-hidden" role="status">{t('casino.loadingMore')}</p>}
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
