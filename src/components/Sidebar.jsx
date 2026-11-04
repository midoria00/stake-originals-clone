import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { t } from '../i18n'
import NavMenu from './NavMenu'

function Sidebar({ collapsed, onToggle }) {
    const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
    return (
        <aside className={`app-sidebar${collapsed ? ' is-collapsed' : ''}`}>
            <div className="app-sidebar__top">
                <button type="button" className="icon-button" onClick={onToggle} aria-label={t('nav.toggleSidebar')} aria-expanded={!collapsed}>
                    <Toggle size={18} aria-hidden="true" />
                </button>
            </div>
            <NavMenu collapsed={collapsed} />
        </aside>
    )
}

export default Sidebar
