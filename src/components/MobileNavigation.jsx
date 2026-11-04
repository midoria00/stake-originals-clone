import { useEffect } from 'react'
import { Drawer } from 'antd'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Dices, House, Ticket, UserRound, Wallet } from 'lucide-react'
import { Logo } from '../brand/Brand'
import { gameFromPath } from '../games'
import { t } from '../i18n'
import { useBetSlip } from '../sports/BetSlipContext'
import { FootballIcon } from './icons'
import NavMenu from './NavMenu'
import SearchBox from './SearchBox'
import './MobileNavigation.css'

// Bottom bar on phones: Início, Cassino, Esportes, Bilhete (opens the slip), Carteira.
const primaryRoutes = [
    { path: '/', key: 'nav.home', Icon: House, end: true },
    { path: '/cassino', key: 'nav.casino', Icon: Dices },
    { path: '/sports', key: 'nav.sports', Icon: FootballIcon },
]

function MobileNavigation({ drawerOpen, onClose, returnFocusRef, onOpenSlip }) {
    const location = useLocation()
    const { selections } = useBetSlip()
    const inCasino = Boolean(gameFromPath(location.pathname)) || ['/favoritos', '/recentes'].includes(location.pathname)

    useEffect(() => onClose(), [location.pathname, location.search, onClose])

    return (
        <>
            <Drawer
                title={<Logo />}
                placement="left"
                width="min(86vw, 340px)"
                open={drawerOpen}
                onClose={onClose}
                afterOpenChange={(open) => {
                    if (!open) returnFocusRef.current?.focus()
                }}
                rootClassName="mobile-navigation-drawer"
                closeIcon={<span aria-label={t('nav.closeMenu')}>✕</span>}
            >
                <SearchBox onDone={onClose} />
                <p className="mobile-drawer__visitor">
                    <UserRound size={16} aria-hidden="true" />
                    {t('common.visitorHint')}
                </p>
                <NavMenu onNavigate={onClose} />
            </Drawer>

            <nav className="mobile-bottom-nav" aria-label={t('nav.primary')}>
                {primaryRoutes.map(({ path, key, Icon, end }) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={end}
                        className={({ isActive }) => (isActive || (path === '/cassino' && inCasino) ? 'active' : '')}
                    >
                        <Icon size={20} aria-hidden="true" />
                        <span>{t(key)}</span>
                    </NavLink>
                ))}
                <button type="button" onClick={onOpenSlip} aria-haspopup="dialog">
                    <Ticket size={20} aria-hidden="true" />
                    <span>{t('nav.betSlip')}</span>
                    {selections.length > 0 && <span className="mobile-bottom-nav__badge">{selections.length}</span>}
                </button>
                <Link to="/carteira" className={location.pathname === '/carteira' ? 'active' : ''}>
                    <Wallet size={20} aria-hidden="true" />
                    <span>{t('nav.wallet')}</span>
                </Link>
            </nav>
        </>
    )
}

export default MobileNavigation
