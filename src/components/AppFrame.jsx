import { Component } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { formatCoins } from '../i18n/format'

// Shared shell pieces: route error boundary, loading skeleton, global toasts, migration notice.

export class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error) {
        console.error('[123bet] route error', error)
    }

    render() {
        if (!this.state.error) return this.props.children
        return (
            <div className="state-panel state-panel--error" role="alert">
                <TriangleAlert size={28} aria-hidden="true" />
                <h1>{t('common.errorTitle')}</h1>
                <p>{t('common.errorBody')}</p>
                <div className="state-panel__actions">
                    <button type="button" className="button button--primary" onClick={() => this.setState({ error: null })}>{t('common.retry')}</button>
                    <Link to="/" className="button button--ghost" onClick={() => this.setState({ error: null })}>{t('common.backHome')}</Link>
                </div>
            </div>
        )
    }
}

export function PageSkeleton() {
    return (
        <div className="page-skeleton" role="status" aria-live="polite">
            <span className="visually-hidden">{t('common.loading')}</span>
            <div className="skeleton skeleton--hero" />
            <div className="page-skeleton__row">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton skeleton--card" />)}
            </div>
        </div>
    )
}

const TOAST_ICONS = { win: CircleCheck, loss: CircleAlert, error: TriangleAlert, bet: Info }

export function Toasts() {
    const { toasts } = useWallet()
    return (
        <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map((toast) => {
                const Icon = TOAST_ICONS[toast.type] ?? Info
                return (
                    <div key={toast.id} className={`toast toast--${toast.type}`}>
                        <Icon size={18} aria-hidden="true" />
                        <div>
                            <strong>{toast.title}</strong>
                            {toast.description && <span>{toast.description}</span>}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export function MigrationNotice() {
    const { migratedFrom, migrationSeen, dismissMigrationNotice } = useWallet()
    if (migratedFrom === null || migrationSeen) return null
    return (
        <div className="notice-bar" role="note">
            <p>{t('common.migrationNotice', { amount: formatCoins(migratedFrom) })}</p>
            <button type="button" className="button button--small" onClick={dismissMigrationNotice}>{t('common.gotIt')}</button>
        </div>
    )
}
