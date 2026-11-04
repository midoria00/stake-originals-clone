import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Star, UserRound } from 'lucide-react'
import { Coins, Logo } from '../brand/Brand'
import { useWallet } from '../context/WalletContext'
import { gameFromPath } from '../games'
import { t } from '../i18n'
import { formatCoins, formatNumber, formatTime } from '../i18n/format'
import { useFavoriteGames } from '../lib/storage'
import { FREE_CREDIT_OPTIONS, FREE_CREDITS_CEILING } from '../wallet/ledger'
import SearchBox from './SearchBox'

const CASINO_PATHS = ['/cassino', '/favoritos', '/recentes']

export function useFreeCredits() {
    const { addFreeCredits, showToast } = useWallet()
    return (amount) => {
        if (addFreeCredits(amount)) showToast('win', t('wallet.addedTitle'), t('wallet.addedBody', { amount: formatNumber(amount) }))
        else showToast('error', t('wallet.addFree'), t('wallet.ceilingReached', { limit: formatNumber(FREE_CREDITS_CEILING) }))
    }
}

function WalletMenu() {
    const { balance, history } = useWallet()
    const addFree = useFreeCredits()
    const [open, setOpen] = useState(false)
    const rootRef = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        const onPointer = (event) => !rootRef.current?.contains(event.target) && setOpen(false)
        const onKey = (event) => event.key === 'Escape' && setOpen(false)
        document.addEventListener('pointerdown', onPointer)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onPointer)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    return (
        <div className="wallet-menu" ref={rootRef}>
            <button
                type="button"
                className="wallet-menu__button"
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={t('wallet.openWallet', { amount: formatCoins(balance) })}
                onClick={() => setOpen((value) => !value)}
            >
                <Coins value={balance} />
            </button>
            {open && (
                <div className="wallet-menu__panel" role="dialog" aria-label={t('wallet.title')}>
                    <p className="wallet-menu__label">{t('wallet.balance')}</p>
                    <p className="wallet-menu__balance"><Coins value={balance} size={22} /></p>
                    <p className="wallet-menu__note">{t('wallet.whatAreCoins')}</p>
                    <p className="wallet-menu__label">{t('wallet.addFree')}</p>
                    <div className="wallet-menu__chips">
                        {FREE_CREDIT_OPTIONS.map((amount) => (
                            <button key={amount} type="button" onClick={() => addFree(amount)}>{t('wallet.addAmount', { amount: formatNumber(amount) })}</button>
                        ))}
                    </div>
                    {history.length > 0 && (
                        <ul className="wallet-menu__history" aria-label={t('wallet.history')}>
                            {history.slice(0, 4).map((entry) => (
                                <li key={entry.id}>
                                    <span>{t(`wallet.types.${entry.type}`)} · {t(`wallet.sources.${entry.source}`)}</span>
                                    <span className={entry.type === 'bet' ? 'is-negative' : 'is-positive'}>
                                        {entry.type === 'bet' ? '−' : '+'}{formatCoins(entry.amount)}
                                    </span>
                                    <time dateTime={entry.at}>{formatTime(entry.at)}</time>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link to="/carteira" className="wallet-menu__link" onClick={() => setOpen(false)}>{t('home.openWallet')}</Link>
                </div>
            )}
        </div>
    )
}

function Header({ menuOpen, menuButtonRef, onMenuClick }) {
    const { pathname } = useLocation()
    const game = gameFromPath(pathname)
    const favorites = useFavoriteGames()
    const isFavorite = game ? favorites.has(game.id) : false
    const casinoActive = Boolean(game) || CASINO_PATHS.some((path) => pathname.startsWith(path))

    return (
        <header className="app-header">
            <button
                ref={menuButtonRef}
                type="button"
                className="icon-button app-header__menu"
                aria-label={t('nav.openMenu')}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                onClick={onMenuClick}
            >
                <Menu size={20} aria-hidden="true" />
            </button>
            <Link to="/" className="app-header__logo" aria-label={`123bet, ${t('nav.home')}`}>
                <Logo />
            </Link>
            <nav className="app-header__tabs" aria-label={t('nav.primary')}>
                <Link to="/cassino" className={casinoActive ? 'is-active' : ''} aria-current={casinoActive ? 'page' : undefined}>{t('nav.casino')}</Link>
                <NavLink to="/sports" className={({ isActive }) => (isActive ? 'is-active' : '')}>{t('nav.sports')}</NavLink>
            </nav>
            <div className="app-header__search">
                <SearchBox />
            </div>
            <div className="app-header__actions">
                {game ? (
                    <button
                        type="button"
                        className={`icon-button${isFavorite ? ' is-on' : ''}`}
                        aria-pressed={isFavorite}
                        aria-label={`${isFavorite ? t('common.unfavorite') : t('common.favorite')}: ${game.navLabel}`}
                        title={isFavorite ? t('common.unfavorite') : t('common.favorite')}
                        onClick={() => favorites.toggle(game.id)}
                    >
                        <Star size={18} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                ) : (
                    <Link to="/favoritos" className="icon-button app-header__desktop" aria-label={t('nav.favorites')} title={t('nav.favorites')}>
                        <Star size={18} aria-hidden="true" />
                    </Link>
                )}
                <WalletMenu />
                <span className="visitor-chip app-header__desktop" title={t('common.visitorHint')}>
                    <UserRound size={16} aria-hidden="true" />
                    {t('common.visitor')}
                </span>
            </div>
        </header>
    )
}

export default Header
