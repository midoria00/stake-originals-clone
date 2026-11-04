import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import Page from '../components/Page'
import { t } from '../i18n'
import { formatDateTime } from '../i18n/format'

// Read-only status for whoever holds ADMIN_TOKEN. The server decides everything: without the token the
// endpoint answers 404 and this page shows "desativada". The token lives only in this component's memory.
async function requestStatus(token) {
    const response = await fetch('/api/admin/status', { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
    return { status: response.status, body: response.ok ? await response.json() : null }
}

function ProvidersTable({ data }) {
    return (
        <div className="table-wrap">
            <table className="data-table">
                <thead>
                    <tr>
                        <th scope="col">{t('casino.admin.columns.provider')}</th>
                        <th scope="col">{t('casino.admin.columns.status')}</th>
                        <th scope="col" className="num">{t('casino.admin.columns.games')}</th>
                        <th scope="col" className="num">{t('casino.admin.columns.demos')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.providers.map((row) => (
                        <tr key={row.id}>
                            <th scope="row">{row.name}</th>
                            <td>{row.status.integrated ? t('casino.status.integrated') : t('casino.status.pending')}</td>
                            <td className="num">{row.games}</td>
                            <td className="num">{row.executableGames}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function AdminPage() {
    const [state, setState] = useState({ phase: 'checking', data: null, message: '' })
    const [token, setToken] = useState('')

    useEffect(() => {
        requestStatus(null)
            .then(({ status }) => setState({ phase: status === 401 ? 'login' : 'disabled', data: null, message: '' }))
            .catch(() => setState({ phase: 'disabled', data: null, message: '' }))
    }, [])

    const submit = async (event) => {
        event.preventDefault()
        try {
            const { status, body } = await requestStatus(token)
            if (status === 200) setState({ phase: 'ready', data: body, message: '' })
            else if (status === 404) setState({ phase: 'disabled', data: null, message: '' })
            else setState({ phase: 'login', data: null, message: status === 401 ? t('casino.admin.invalid') : t('casino.admin.error') })
        } catch {
            setState({ phase: 'login', data: null, message: t('casino.admin.error') })
        }
    }

    const logout = () => {
        setToken('')
        setState({ phase: 'login', data: null, message: '' })
    }

    if (state.phase === 'checking') return <div className="page-skeleton" role="status" aria-label={t('common.loading')}><span className="skeleton skeleton--line" /></div>
    if (state.phase === 'disabled') {
        return (
            <div className="state-panel">
                <Lock size={28} aria-hidden="true" />
                <h1>{t('casino.admin.disabledTitle')}</h1>
                <p>{t('casino.admin.disabledBody')}</p>
            </div>
        )
    }
    if (state.phase === 'login') {
        return (
            <Page title={t('casino.admin.loginTitle')} narrow>
                <form className="panel verify-form" onSubmit={submit}>
                    <label className="field field--wide">
                        {t('casino.admin.token')}
                        <input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required minLength={32} />
                    </label>
                    {state.message && <p className="form-error" role="alert">{state.message}</p>}
                    <div className="field--wide"><button type="submit" className="button button--primary">{t('casino.admin.enter')}</button></div>
                </form>
            </Page>
        )
    }

    const { data } = state
    return (
        <Page title={t('casino.admin.title')} subtitle={t('casino.totals', data.totals)} actions={<button type="button" className="button button--ghost button--small" onClick={logout}>{t('casino.admin.logout')}</button>}>
            <p className="notice-bar"><span>{t('casino.admin.readOnly')}</span></p>
            <section className="page-section">
                <div className="page-section__head"><h2>{t('casino.admin.providers')}</h2></div>
                <ProvidersTable data={data} />
            </section>
            <section className="page-section">
                <div className="page-section__head"><h2>{t('casino.admin.sources')}</h2></div>
                <ul className="plain-list">
                    {data.sources.map((source) => (
                        <li key={source.id}>
                            <strong>{source.name}</strong>
                            <span className="muted">{t(`casino.admin.sourceKinds.${source.kind}`)} · {t(`casino.admin.sourceStatus.${source.status}`)}</span>
                        </li>
                    ))}
                </ul>
            </section>
            <section className="page-section">
                <div className="page-section__head"><h2>{t('casino.admin.imports')}</h2></div>
                {data.catalog.imports.length === 0 ? <p className="muted">{t('casino.admin.noImports')}</p> : (
                    <ul className="plain-list">
                        {data.catalog.imports.map((entry) => (
                            <li key={`${entry.source}-${entry.importedAt}`}>
                                <span><strong>{entry.file}</strong> · {entry.source} · {formatDateTime(entry.importedAt)}<br /><span className="muted">{entry.authorization}</span></span>
                                <span>{t('casino.admin.importResult', entry)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </Page>
    )
}
