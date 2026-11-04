import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Star } from 'lucide-react'
import { Logo } from '../brand/Brand'
import { HeaderAccount } from '../account/components'
import { useWallet } from '../context/WalletContext'
import { gameFromPath } from '../games'
import { t } from '../i18n'
import { formatNumber } from '../i18n/format'
import { useFavoriteGames } from '../lib/storage'
import { FREE_CREDITS_CEILING } from '../wallet/ledger'
import SearchBox from './SearchBox'

const CASINO_PATHS = ['/cassino', '/favoritos', '/recentes']

export function useFreeCredits() {
    const { addFreeCredits, showToast } = useWallet()
    return async (amount) => {
        if (await addFreeCredits(amount)) showToast('win', t('wallet.addedTitle'), t('wallet.addedBody', { amount: formatNumber(amount) }))
        else showToast('error', t('wallet.addFree'), t('wallet.ceilingReached', { limit: formatNumber(FREE_CREDITS_CEILING) }))
    }
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
                <HeaderAccount />
            </div>
        </header>
    )
}

export default Header
