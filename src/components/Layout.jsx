import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'antd'
import { Outlet, useLocation } from 'react-router-dom'
import { gameFromPath } from '../games'
import { t } from '../i18n'
import { recordRecentGame, useStoredState } from '../lib/storage'
import { BetSlipProvider } from '../sports/BetSlipContext'
import { MigrationNotice, PageSkeleton, RouteErrorBoundary, Toasts } from './AppFrame'
import { AuthModal, SessionExpiredNotice } from '../account/components'
import Header from './Header'
import MobileNavigation from './MobileNavigation'
import Sidebar from './Sidebar'
import '../styles/layout.css'

// The slip UI (and the sports stylesheet) loads only when the mobile slip is opened.
const BetSlip = lazy(() => import('../sports/BetSlip'))

const PAGE_TITLES = {
    '/cassino/jogos': 'nav.allGames',
    '/cassino/provedores': 'nav.providers',
    '/cassino/jogo': 'nav.casino',
    '/cassino': 'nav.casino',
    '/admin': 'account.admin.title',
    '/conta/carteira': 'account.menu.wallet',
    '/conta/adicionar-creditos': 'account.menu.addCredits',
    '/conta/historico': 'account.menu.history',
    '/conta/cupons': 'account.menu.coupons',
    '/conta/cashback': 'account.menu.cashback',
    '/conta/seguranca': 'account.menu.security',
    '/conta/saques': 'account.withdrawals.title',
    '/conta': 'account.menu.account',
    '/entrar': 'account.signIn',
    '/criar-conta': 'account.signUp',
    '/recuperar-senha': 'account.recover.title',
    '/termos': 'account.legal.termsTitle',
    '/sports': 'nav.sports',
    '/favoritos': 'nav.favorites',
    '/recentes': 'nav.recent',
    '/minhas-apostas': 'nav.myBets',
    '/carteira': 'nav.wallet',
    '/configuracoes': 'nav.settings',
    '/ajuda': 'nav.help',
    '/como-funciona': 'nav.howGamesWork',
    '/verificar': 'nav.verify',
    '/sobre': 'nav.about',
    '/privacidade': 'nav.privacy',
}

const isBoolean = (value) => typeof value === 'boolean'

function useRouteEffects(pathname) {
    useEffect(() => {
        const game = gameFromPath(pathname)
        if (game) recordRecentGame(game.id)
        const key = Object.keys(PAGE_TITLES).find((path) => pathname.startsWith(path))
        const label = game?.navLabel ?? (key ? t(PAGE_TITLES[key]) : null)
        document.title = label ? `${label} | 123bet` : '123bet | Cassino e esportes em modo simulação'
    }, [pathname])
}

function Layout() {
    const { pathname } = useLocation()
    const [collapsed, setCollapsed] = useStoredState('123bet_sidebar_collapsed_v1', false, isBoolean)
    const [menuOpen, setMenuOpen] = useState(false)
    const [slipOpen, setSlipOpen] = useState(false)
    const menuButtonRef = useRef(null)
    const closeMenu = useCallback(() => setMenuOpen(false), [])
    const outletContext = useMemo(() => ({ openSlip: () => setSlipOpen(true) }), [])
    useRouteEffects(pathname)

    return (
        <BetSlipProvider>
            <a className="skip-link" href="#main">{t('nav.skipToContent')}</a>
            <div className={`app-layout${collapsed ? ' is-sidebar-collapsed' : ''}`}>
                <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
                <div className="app-main-wrapper">
                    <Header menuOpen={menuOpen} menuButtonRef={menuButtonRef} onMenuClick={() => setMenuOpen(true)} />
                    <MigrationNotice />
                    <SessionExpiredNotice />
                    <main id="main" className="main-content" tabIndex={-1}>
                        <RouteErrorBoundary key={pathname}>
                            <Suspense fallback={<PageSkeleton />}>
                                <Outlet context={outletContext} />
                            </Suspense>
                        </RouteErrorBoundary>
                    </main>
                </div>
                <MobileNavigation drawerOpen={menuOpen} onClose={closeMenu} returnFocusRef={menuButtonRef} onOpenSlip={() => setSlipOpen(true)} />
                <Drawer
                    title={t('nav.betSlip')}
                    placement="bottom"
                    height="85dvh"
                    open={slipOpen}
                    onClose={() => setSlipOpen(false)}
                    rootClassName="slip-drawer"
                    destroyOnClose
                >
                    <Suspense fallback={<p className="route-loading" role="status">{t('common.loading')}</p>}>
                        <BetSlip />
                    </Suspense>
                </Drawer>
                <Toasts />
                <AuthModal />
            </div>
        </BetSlipProvider>
    )
}

export default Layout
