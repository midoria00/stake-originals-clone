import { Outlet, useOutletContext } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { t } from '../i18n'
import BetSlip from './BetSlip'
import { useBetSlip } from './BetSlipContext'
import './sports.css'

// The bet slip state lives in Layout (shared with the mobile "Bilhete" tab). Wide screens pin the slip
// next to the matches; tablets get a floating button that opens the same slip drawer as the phone tab.
export default function SportsLayout() {
    const { openSlip } = useOutletContext() ?? {}
    const { selections } = useBetSlip()
    return (
        <div className="sports-shell">
            <div className="sports-main">
                <Outlet />
            </div>
            <aside className="sports-slip-panel" aria-label={t('sports.slip.label')}>
                <BetSlip />
            </aside>
            {openSlip && (
                <button type="button" className="sp-slip-fab" onClick={openSlip} aria-haspopup="dialog" aria-label={t('sports.slip.openFab')}>
                    <Ticket size={18} aria-hidden="true" />
                    {t('nav.betSlip')}
                    {selections.length > 0 && <span className="sp-count">{selections.length}</span>}
                </button>
            )}
        </div>
    )
}
