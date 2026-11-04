import { useEffect } from 'react'
import { Drawer } from 'antd'
import { NavLink, useLocation } from 'react-router-dom'
import { GAMES } from '../games'
import { useThemeSettings } from '../context/ThemeContext'
import './MobileNavigation.css'

const primaryRoutes = [
    { path: '/', label: 'Home', icon: '⌂' },
    { path: '/sports', label: 'Esportes', icon: '⚽' },
    ...GAMES.map(game => ({ path: game.path, label: game.name, icon: '◆' })),
]

const comingSoon = ['Favourites', 'Recent', 'Challenges', 'My Bets']

function MobileNavigation({ drawerOpen, onClose, returnFocusRef }) {
    const location = useLocation()
    const { paletteId, palettes, setPaletteId } = useThemeSettings()

    useEffect(() => onClose(), [location.pathname, onClose])

    return (
        <>
            <Drawer
                title="Menu"
                placement="left"
                width="min(88vw, 360px)"
                open={drawerOpen}
                onClose={onClose}
                afterOpenChange={open => {
                    if (!open) returnFocusRef.current?.focus()
                }}
                rootClassName="mobile-navigation-drawer"
            >
                <label className="mobile-drawer-field">
                    <span>Search</span>
                    <input type="search" placeholder="Search your game" />
                </label>
                <label className="mobile-drawer-field">
                    <span>Palette</span>
                    <select value={paletteId} onChange={event => setPaletteId(event.target.value)}>
                        {palettes.map(palette => (
                            <option key={palette.id} value={palette.id}>{palette.name}</option>
                        ))}
                    </select>
                </label>
                <div className="mobile-drawer-actions" aria-label="Account shortcuts">
                    {['Profile', 'Notifications', 'Chat'].map(label => (
                        <button key={label} type="button">{label}</button>
                    ))}
                </div>
                <div className="mobile-coming-soon" aria-label="Coming soon">
                    {comingSoon.map(label => (
                        <button key={label} type="button" disabled>
                            <span>{label}</span>
                            <small>Coming soon</small>
                        </button>
                    ))}
                </div>
            </Drawer>

            <nav className="mobile-bottom-nav" aria-label="Primary navigation">
                {primaryRoutes.map(route => (
                    <NavLink
                        key={route.path}
                        to={route.path}
                        end={route.path === '/'}
                        className={({ isActive }) => isActive ? 'active' : ''}
                    >
                        <span aria-hidden="true">{route.icon}</span>
                        <span>{route.label}</span>
                    </NavLink>
                ))}
            </nav>
        </>
    )
}

export default MobileNavigation
