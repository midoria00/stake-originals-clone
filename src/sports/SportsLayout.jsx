import { Outlet } from 'react-router-dom'
import BetSlip from './BetSlip'
import './sports.css'

// The bet slip state lives in Layout (shared with the mobile "Bilhete" tab); on wide screens
// the slip is pinned next to the matches.
export default function SportsLayout() {
    return (
        <div className="sports-shell">
            <div className="sports-main">
                <Outlet />
            </div>
            <aside className="sports-slip-panel" aria-label="Bilhete de apostas">
                <BetSlip />
            </aside>
        </div>
    )
}
