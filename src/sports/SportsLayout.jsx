import { useState } from 'react'
import { Drawer } from 'antd'
import { Outlet } from 'react-router-dom'
import { BetSlipProvider, useBetSlip } from './BetSlipContext'
import BetSlip from './BetSlip'
import './sports.css'

function MobileSlip() {
    const { selections } = useBetSlip()
    const [open, setOpen] = useState(false)
    return (
        <>
            <button type="button" className="sp-slip-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
                Bilhete {selections.length > 0 && <span className="sp-count">{selections.length}</span>}
            </button>
            <Drawer
                title="Bilhete de apostas"
                placement="bottom"
                height="85dvh"
                open={open}
                onClose={() => setOpen(false)}
                rootClassName="sp-slip-drawer"
            >
                <BetSlip />
            </Drawer>
        </>
    )
}

// The sports module lives entirely under /sports; the casino games never load it.
export default function SportsLayout() {
    return (
        <BetSlipProvider>
            <div className="sports-shell">
                <div className="sports-main">
                    <Outlet />
                </div>
                <aside className="sports-slip-panel" aria-label="Bilhete de apostas">
                    <BetSlip />
                </aside>
                <MobileSlip />
            </div>
        </BetSlipProvider>
    )
}
