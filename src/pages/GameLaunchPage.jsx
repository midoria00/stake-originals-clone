import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Maximize, Minimize, Star, TriangleAlert } from 'lucide-react'
import { getProvider } from '../../server/casino/providers.js'
import { fetchGames, fetchLaunch } from '../casino/api'
import { favoriteId, GameArt } from '../casino/components'
import Page from '../components/Page'
import { t } from '../i18n'
import { formatDate, formatNumber } from '../i18n/format'
import { recordRecentGame, useFavoriteGames } from '../lib/storage'

const percent = (value) => `${formatNumber(value, 2)}%`

function rtpText(rtp) {
    if (!rtp) return t('casino.game.unknown')
    if (rtp.min === null) return `≤ ${percent(rtp.max)}`
    return rtp.min === rtp.max ? percent(rtp.min) : `${percent(rtp.min)} – ${percent(rtp.max)}`
}

function Details({ game }) {
    return (
        <dl className="game-details">
            <div><dt>{t('casino.category')}</dt><dd>{t(`casino.categories.${game.category}`)}</dd></div>
            <div><dt>{t('casino.game.rtp')}</dt><dd>{rtpText(game.rtp)}</dd></div>
            <div><dt>{t('casino.game.volatility')}</dt><dd>{game.volatility ? t(`casino.game.volatilities.${game.volatility}`) : t('casino.game.unknown')}</dd></div>
            <div><dt>{t('casino.game.platforms')}</dt><dd>{game.platforms.length ? game.platforms.map((p) => t(`casino.game.platformNames.${p}`)).join(', ') : t('casino.game.unknown')}</dd></div>
            <div><dt>{t('casino.game.languages')}</dt><dd>{game.languages.length ? game.languages.join(', ') : t('casino.game.unknown')}</dd></div>
            <div><dt>{t('casino.game.maxWin')}</dt><dd>{game.maxWin ? `${formatNumber(game.maxWin)}×` : t('casino.game.unknown')}</dd></div>
            <div><dt>{t('casino.game.releasedAt')}</dt><dd>{game.releasedAt ? formatDate(`${game.releasedAt}T12:00:00Z`) : t('casino.game.unknown')}</dd></div>
            <div><dt>{t('casino.game.features')}</dt><dd>{game.features?.length ? game.features.map((f) => f.replace(/-/g, ' ')).join(', ') : t('casino.game.unknown')}</dd></div>
        </dl>
    )
}

// The source is named and linked (slot.report terms: "Do not misrepresent the data source"; its
// API page asks for a plain link to slot.report).
const SOURCES = { 'slot-report': { name: 'slot.report', url: 'https://slot.report/', note: 'casino.game.sourceSlotReport' } }

function SourceNote({ game }) {
    const source = SOURCES[game.source]
    return (
        <>
            {source && (
                <p className="muted">
                    {t('casino.game.sourceLabel')} <a href={source.url} target="_blank" rel="noopener">{source.name}</a>. {t(source.note)}
                </p>
            )}
            {game.image?.credit && <p className="muted">{t('casino.game.imageCredit', { credit: game.image.credit })}</p>}
        </>
    )
}

export default function GameLaunchPage() {
    const { id } = useParams()
    const [state, setState] = useState({ status: 'loading', game: null, launch: null })
    const [fullscreen, setFullscreen] = useState(false)
    const stageRef = useRef(null)
    const favorites = useFavoriteGames()

    useEffect(() => {
        const controller = new AbortController()
        setState({ status: 'loading', game: null, launch: null })
        ;(async () => {
            try {
                const { items } = await fetchGames({ ids: id }, controller.signal)
                const game = items[0]
                if (!game) return setState({ status: 'missing', game: null, launch: null })
                if (game.internalPath) return setState({ status: 'internal', game, launch: null })
                setState({ status: 'checking', game, launch: null })
                const launch = await fetchLaunch(game.id, controller.signal).catch((error) => (error.name === 'AbortError' ? null : { available: false, reason: 'error' }))
                if (launch) setState({ status: 'ready', game, launch })
            } catch (error) {
                if (error.name !== 'AbortError') setState({ status: 'error', game: null, launch: null })
            }
        })()
        return () => controller.abort()
    }, [id])

    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    const { status, game, launch } = state
    const recordedId = game && !game.internalPath ? game.id : null
    // Catalog games join Recentes once their page opens (Originals are recorded by the layout).
    useEffect(() => {
        if (recordedId) recordRecentGame(recordedId)
    }, [recordedId])

    if (status === 'internal') return <Navigate to={game.internalPath} replace />
    if (status === 'missing' || status === 'error') {
        return (
            <div className="state-panel state-panel--error" role="alert">
                <TriangleAlert size={28} aria-hidden="true" />
                <h1>{status === 'missing' ? t('casino.game.notFound') : t('casino.loadError')}</h1>
                <Link className="button button--primary" to="/cassino/jogos">{t('casino.game.back')}</Link>
            </div>
        )
    }
    if (!game) return <div className="page-skeleton" role="status" aria-label={t('casino.game.loading')}><span className="skeleton skeleton--hero" /></div>

    const provider = getProvider(game.provider)
    const isFavorite = favorites.has(favoriteId(game))
    const canPlay = launch?.available && launch.kind === 'iframe'
    const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : stageRef.current?.requestFullscreen?.())

    return (
        <Page title={game.name} subtitle={`${t('casino.game.provider')}: ${provider?.name ?? game.provider}`}>
            <div className="game-toolbar">
                <Link className="button button--ghost button--small" to="/cassino/jogos"><ArrowLeft size={16} aria-hidden="true" />{t('casino.game.back')}</Link>
                <Link className="button button--ghost button--small" to={`/cassino/provedores/${game.provider}`}>{provider?.name ?? game.provider}</Link>
                <button
                    type="button"
                    className={`icon-button${isFavorite ? ' is-on' : ''}`}
                    aria-pressed={isFavorite}
                    aria-label={`${isFavorite ? t('common.unfavorite') : t('common.favorite')}: ${game.name}`}
                    onClick={() => favorites.toggle(favoriteId(game))}
                >
                    <Star size={18} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
                {canPlay && (
                    <button type="button" className="button button--ghost button--small" onClick={toggleFullscreen}>
                        {fullscreen ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
                        {fullscreen ? t('casino.game.exitFullscreen') : t('casino.game.fullscreen')}
                    </button>
                )}
            </div>

            {canPlay ? (
                <div className="game-stage" ref={stageRef}>
                    {/* Only official demo URLs from an authorized catalog, on origins the owner allowed (server-checked). */}
                    <iframe
                        src={launch.url}
                        title={t('casino.game.frameTitle', { name: game.name, provider: provider?.name ?? game.provider })}
                        allow="fullscreen; autoplay"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        referrerPolicy="no-referrer"
                    />
                </div>
            ) : (
                <div className="game-hero">
                    <span className="game-hero__art catalog-card__art"><GameArt game={game} eager /></span>
                    <div className="game-hero__info" role="status">
                        {status === 'checking' ? <p>{t('casino.game.loading')}</p> : (
                            <>
                                <TriangleAlert size={28} aria-hidden="true" />
                                <h2>{t('casino.game.unavailableTitle')}</h2>
                                <p>{t(`casino.game.reasons.${launch?.reason ?? 'error'}`)}</p>
                                {!game.image?.src && <p className="muted">{t('casino.game.noCover')}</p>}
                            </>
                        )}
                    </div>
                </div>
            )}
            {canPlay && <p className="muted">{t('casino.game.demoInfo')}</p>}

            <section className="page-section" aria-labelledby="game-details">
                <div className="page-section__head"><h2 id="game-details">{t('casino.game.details')}</h2></div>
                {game.description && <p>{game.description}</p>}
                <Details game={game} />
                <SourceNote game={game} />
            </section>
        </Page>
    )
}
