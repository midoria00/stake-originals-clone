import { Link, NavLink, useLocation } from 'react-router-dom'
import { BookOpen, Building2, CircleHelp, Clock, Dices, House, LayoutGrid, Info, Lock, Settings, ShieldCheck, Star, Ticket, Trophy, Wallet } from 'lucide-react'
import { GAMES } from '../games'
import { FEATURED_LEAGUES } from '../../server/sports/leagues.js'
import { t } from '../i18n'
import { FootballIcon, GameIcon } from './icons'

const SECTIONS = [
    { id: 'main', items: [{ to: '/', key: 'nav.home', Icon: House, end: true }] },
    {
        id: 'casino',
        titleKey: 'nav.casino',
        items: [
            { to: '/cassino', key: 'nav.lobby', Icon: Dices, end: true },
            { to: '/cassino/jogos', key: 'nav.allGames', Icon: LayoutGrid },
            { to: '/cassino/provedores', key: 'nav.providers', Icon: Building2 },
            { to: '/favoritos', key: 'nav.favorites', Icon: Star },
            { to: '/recentes', key: 'nav.recent', Icon: Clock },
            ...GAMES.map((game) => ({ to: game.path, label: game.navLabel, gameId: game.id })),
        ],
    },
    {
        id: 'sports',
        titleKey: 'nav.sports',
        items: [
            { to: '/sports', key: 'nav.football', Icon: FootballIcon, sportsRoot: true },
            ...FEATURED_LEAGUES.slice(0, 5).map((league) => ({ to: `/sports?league=${league.id}`, label: league.name, Icon: Trophy, leagueId: String(league.id) })),
        ],
    },
    {
        id: 'account',
        titleKey: 'nav.account',
        items: [
            { to: '/minhas-apostas', key: 'nav.myBets', Icon: Ticket },
            { to: '/carteira', key: 'nav.wallet', Icon: Wallet },
            { to: '/configuracoes', key: 'nav.settings', Icon: Settings },
        ],
    },
    {
        id: 'support',
        titleKey: 'nav.support',
        items: [
            { to: '/ajuda', key: 'nav.help', Icon: CircleHelp },
            { to: '/como-funciona', key: 'nav.howGamesWork', Icon: BookOpen },
            { to: '/verificar', key: 'nav.verify', Icon: ShieldCheck },
            { to: '/sobre', key: 'nav.about', Icon: Info },
            { to: '/privacidade', key: 'nav.privacy', Icon: Lock },
        ],
    },
]

export default function NavMenu({ collapsed = false, onNavigate }) {
    const { pathname, search } = useLocation()
    const league = new URLSearchParams(search).get('league')

    return (
        <nav className={`nav-menu${collapsed ? ' is-collapsed' : ''}`} aria-label={t('nav.menu')}>
            {SECTIONS.map((section) => (
                <div key={section.id} className="nav-menu__section">
                    {section.titleKey && <h3 className="nav-menu__title">{t(section.titleKey)}</h3>}
                    {section.items.map((item) => {
                        const label = item.label ?? t(item.key)
                        const icon = item.gameId ? <GameIcon id={item.gameId} size={18} /> : <item.Icon size={18} aria-hidden="true" />
                        // League links share /sports, so their active state comes from the query string.
                        if (item.leagueId || item.sportsRoot) {
                            const active = pathname.startsWith('/sports') && (item.leagueId ? league === item.leagueId : !league)
                            return (
                                <Link key={item.to} to={item.to} className={`nav-menu__item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined} onClick={onNavigate}>
                                    {icon}<span>{label}</span>
                                </Link>
                            )
                        }
                        return (
                            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-menu__item${isActive ? ' is-active' : ''}`} title={collapsed ? label : undefined} onClick={onNavigate}>
                                {icon}<span>{label}</span>
                            </NavLink>
                        )
                    })}
                </div>
            ))}
        </nav>
    )
}
