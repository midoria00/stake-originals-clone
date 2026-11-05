import { useCallback, useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import Page, { Chips, EmptyState } from '../components/Page'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { formatCoins, formatDateTime, formatNumber } from '../i18n/format'
import { adminApi, centsToCoins, errorMessage } from './api'
import { useAuth } from './AuthContext'
import { RequireAuth, useSubmit } from './components'

// Staff console. Every call is authorized on the server by the account role; hiding a control
// here is only a convenience, never the protection.
const TABS = ['overview', 'users', 'transactions', 'gateway', 'withdrawals', 'coupons', 'errors', 'audit', 'catalog']

function useAdminData(loader, deps = []) {
    const [state, setState] = useState({ loading: true, data: null, error: '' })
    const load = useCallback(async () => {
        setState((previous) => ({ ...previous, loading: true, error: '' }))
        try {
            setState({ loading: false, data: await loader(), error: '' })
        } catch (error) {
            setState({ loading: false, data: null, error: errorMessage(error) })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
    useEffect(() => { load() }, [load])
    return [state, load]
}

function Loaded({ state, children }) {
    if (state.loading && !state.data) return <div className="page-skeleton" role="status" aria-label={t('common.loading')}><span className="skeleton skeleton--line" /></div>
    if (state.error) return <p className="form-error" role="alert">{state.error}</p>
    return children(state.data)
}

const money = (cents) => formatCoins(centsToCoins(cents))

function Table({ head, rows }) {
    if (!rows.length) return <EmptyState text={t('account.admin.empty')} />
    return (
        <div className="table-wrap">
            <table className="data-table">
                <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    )
}

function Overview() {
    const [state] = useAdminData(() => adminApi.overview())
    return (
        <Loaded state={state}>
            {({ metrics }) => (
                <div className="stat-grid">
                    {['users', 'usersLast7Days', 'transactions24h', 'openSportsBets', 'errors24h', 'ledgerCheck'].map((key) => (
                        <dl key={key} className="stat"><dt>{t(`account.admin.metrics.${key}`)}</dt><dd>{formatNumber(metrics[key])}</dd></dl>
                    ))}
                    {['coinsInWallets', 'promoInWallets'].map((key) => (
                        <dl key={key} className="stat"><dt>{t(`account.admin.metrics.${key}`)}</dt><dd>{money(metrics[key])}</dd></dl>
                    ))}
                </div>
            )}
        </Loaded>
    )
}

function AdjustForm({ userId, onDone }) {
    const { showToast } = useWallet()
    const [amount, setAmount] = useState('')
    const [reason, setReason] = useState('')
    const [state, submit] = useSubmit(async () => {
        await adminApi.adjust({ userId, amount, reason })
        setAmount('')
        setReason('')
        showToast('win', t('account.admin.adjusted'))
        onDone()
    })
    return (
        <section className="panel">
            <h2>{t('account.admin.adjustTitle')}</h2>
            <p className="muted">{t('account.admin.adjustBody')}</p>
            <form className="account-inline-form" onSubmit={submit}>
                <label className="field">{t('account.admin.adjustAmount')}<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required /></label>
                <label className="field">{t('account.admin.adjustReason')}<input value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={200} required /></label>
                <button type="submit" className="button button--primary" disabled={state.busy}>{t('account.admin.adjustSubmit')}</button>
                {state.error && <p className="form-error" role="alert">{state.error}</p>}
            </form>
        </section>
    )
}

function UserDetail({ id, onBack }) {
    const { isAdmin, me } = useAuth()
    const [state, reload] = useAdminData(() => adminApi.user(id), [id])
    return (
        <>
            <button type="button" className="button button--ghost button--small" onClick={onBack}>{t('account.admin.back')}</button>
            <Loaded state={state}>
                {(user) => (
                    <>
                        <section className="panel">
                            <h2>@{user.profile.username} · {user.profile.fullName}</h2>
                            <p>{user.email} · {t(`account.page.role.${user.profile.role}`)} · {formatDateTime(user.profile.createdAt)}</p>
                            <p>{t('account.mainBalance')}: <strong>{money(user.wallet.balance)}</strong> · {t('account.bonusBalance')}: <strong>{money(user.wallet.promoBalance)}</strong></p>
                        </section>
                        {isAdmin && user.profile.id !== me.profile.id && <AdjustForm userId={user.profile.id} onDone={reload} />}
                        <h3>{t('account.history.tabs.transactions')}</h3>
                        <Table head={[t('account.history.date'), t('account.history.type'), t('account.history.origin'), t('account.history.amount'), t('account.history.details')]}
                            rows={user.transactions.map((tx) => (
                                <tr key={tx.id}><td>{formatDateTime(tx.createdAt)}</td><td>{t(`account.history.types.${tx.type}`)}</td><td>{t(`account.history.origins.${tx.origin}`)}</td><td className="num">{money(tx.amount + tx.promoAmount)}</td><td>{tx.metadata?.reason ?? ''}</td></tr>
                            ))} />
                        <h3>{t('account.history.tabs.rounds')}</h3>
                        <Table head={[t('account.history.date'), t('account.wallet.game'), t('account.history.stake'), t('account.history.payout'), t('account.history.status')]}
                            rows={user.rounds.map((round) => (
                                <tr key={round.id}><td>{formatDateTime(round.createdAt)}</td><td>{round.game}</td><td className="num">{money(round.stake)}</td><td className="num">{money(round.payout)}</td><td>{round.status}</td></tr>
                            ))} />
                    </>
                )}
            </Loaded>
        </>
    )
}

function Users() {
    const [query, setQuery] = useState('')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState(null)
    const [state] = useAdminData(() => adminApi.users(search || undefined), [search])
    if (selected) return <UserDetail id={selected} onBack={() => setSelected(null)} />
    return (
        <>
            <form className="account-inline-form" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()) }}>
                <label className="field">{t('account.admin.search')}<input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={40} /></label>
                <button type="submit" className="button button--ghost">{t('common.search')}</button>
            </form>
            <Loaded state={state}>
                {({ items }) => (
                    <Table head={[t('account.admin.user'), t('account.admin.email'), t('account.admin.confirmed'), t('account.admin.balance'), '']}
                        rows={items.map((u) => (
                            <tr key={u.id}>
                                <td>@{u.username}<br /><span className="muted">{u.fullName}</span></td>
                                <td>{u.email}</td>
                                <td>{u.confirmed ? '✓' : '—'}</td>
                                <td className="num">{money(u.balance)}</td>
                                <td><button type="button" className="button button--ghost button--small" onClick={() => setSelected(u.id)}>{t('account.admin.view')}</button></td>
                            </tr>
                        ))} />
                )}
            </Loaded>
        </>
    )
}

function Transactions() {
    const [state] = useAdminData(() => adminApi.transactions())
    return (
        <Loaded state={state}>
            {({ items }) => (
                <Table head={[t('account.history.date'), t('account.admin.user'), t('account.history.type'), t('account.history.origin'), t('account.history.amount'), t('account.history.balanceAfter')]}
                    rows={items.map((tx) => (
                        <tr key={tx.id}><td>{formatDateTime(tx.createdAt)}</td><td>@{tx.username}</td><td>{t(`account.history.types.${tx.type}`)}</td><td>{t(`account.history.origins.${tx.origin}`)}</td><td className="num">{money(tx.amount + tx.promoAmount)}</td><td className="num">{money(tx.balanceAfter)}</td></tr>
                    ))} />
            )}
        </Loaded>
    )
}

function Gateway() {
    const { isAdmin } = useAuth()
    const { showToast } = useWallet()
    const [state, reload] = useAdminData(() => adminApi.paymentEvents())
    const reconcile = async () => {
        try {
            const report = await adminApi.reconcile()
            showToast('win', t('account.admin.reconcile'), t('account.admin.reconciled', { expired: report.expired, mismatches: report.mismatches.length }))
            reload()
        } catch (error) {
            showToast('error', errorMessage(error))
        }
    }
    return (
        <>
            <p className="notice-bar"><span>{t('account.addCredits.sandboxBody')}</span></p>
            {isAdmin && <button type="button" className="button button--ghost button--small" onClick={reconcile}>{t('account.admin.reconcile')}</button>}
            <Loaded state={state}>
                {({ items }) => (
                    <Table head={[t('account.history.date'), t('account.admin.user'), 'Evento', t('account.history.status'), t('account.history.details'), 'R$']}
                        rows={items.map((e) => (
                            <tr key={e.id}><td>{formatDateTime(e.receivedAt)}</td><td>{e.username ? `@${e.username}` : '—'}</td><td><code>{e.type}</code></td><td>{t(`account.addCredits.outcome.${e.outcome}`)}</td><td>{e.detail}</td><td className="num">{e.amountCents ? formatCoins(e.amountCents / 100) : '—'}</td></tr>
                        ))} />
                )}
            </Loaded>
        </>
    )
}

const NEXT = { requested: ['in_review', 'rejected', 'cancelled'], in_review: ['approved', 'rejected', 'cancelled'], approved: ['completed', 'cancelled'] }

function Withdrawals() {
    const { isAdmin } = useAuth()
    const { showToast } = useWallet()
    const [amount, setAmount] = useState('10,00')
    const [note, setNote] = useState('')
    const [state, reload] = useAdminData(() => adminApi.withdrawals())
    const [createState, create] = useSubmit(async () => {
        await adminApi.createWithdrawal({ amount, note })
        reload()
    })
    const move = async (id, to) => {
        try {
            await adminApi.transitionWithdrawal({ id, to })
            reload()
        } catch (error) {
            showToast('error', errorMessage(error))
        }
    }
    return (
        <>
            <section className="panel account-sandbox">
                <span className="account-sandbox__tag">Teste</span>
                <h2>{t('account.withdrawals.testTitle')}</h2>
                <p>{t('account.withdrawals.testBody')}</p>
                <form className="account-inline-form" onSubmit={create}>
                    <label className="field">{t('account.admin.withdrawalAmount')}<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
                    <label className="field">{t('account.admin.withdrawalNote')}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
                    <button type="submit" className="button button--primary" disabled={createState.busy}>{t('account.admin.withdrawalCreate')}</button>
                    {createState.error && <p className="form-error" role="alert">{createState.error}</p>}
                </form>
            </section>
            <Loaded state={state}>
                {({ items }) => (
                    <Table head={[t('account.history.date'), t('account.admin.user'), 'R$', t('account.history.status'), t('account.admin.transition')]}
                        rows={items.map((w) => (
                            <tr key={w.id}>
                                <td>{formatDateTime(w.createdAt)}</td><td>@{w.username}</td><td className="num">{formatCoins(w.amountCents / 100)}</td>
                                <td>{t(`account.withdrawals.status.${w.status}`)}</td>
                                <td>{(NEXT[w.status] ?? []).filter((to) => isAdmin || ['in_review', 'cancelled'].includes(to)).map((to) => (
                                    <button key={to} type="button" className="button button--ghost button--small" onClick={() => move(w.id, to)}>{t(`account.withdrawals.status.${to}`)}</button>
                                ))}</td>
                            </tr>
                        ))} />
                )}
            </Loaded>
        </>
    )
}

function Coupons() {
    const { isAdmin } = useAuth()
    const { showToast } = useWallet()
    const [form, setForm] = useState({ code: '', description: '', amount: '10', maxRedemptions: '100', perUserLimit: '1', bonusDays: '7', validUntil: '', active: true })
    const [state, reload] = useAdminData(() => adminApi.coupons())
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
    const [saveState, save] = useSubmit(async () => {
        await adminApi.saveCoupon({ ...form, maxRedemptions: Number(form.maxRedemptions), perUserLimit: Number(form.perUserLimit), bonusDays: Number(form.bonusDays), validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : '' })
        showToast('win', t('account.admin.couponSaved'))
        reload()
    })
    return (
        <>
            {isAdmin ? (
                <section className="panel">
                    <form className="account-form account-form--grid" onSubmit={save}>
                        <label className="field">{t('account.admin.couponCode')}<input value={form.code} onChange={set('code')} maxLength={24} required /></label>
                        <label className="field">{t('account.admin.couponDescription')}<input value={form.description} onChange={set('description')} maxLength={200} required /></label>
                        <label className="field">{t('account.admin.couponAmount')}<input value={form.amount} onChange={set('amount')} inputMode="decimal" required /></label>
                        <label className="field">{t('account.admin.couponMax')}<input type="number" min="1" value={form.maxRedemptions} onChange={set('maxRedemptions')} required /></label>
                        <label className="field">{t('account.admin.couponPerUser')}<input type="number" min="1" max="10" value={form.perUserLimit} onChange={set('perUserLimit')} required /></label>
                        <label className="field">{t('account.admin.couponDays')}<input type="number" min="1" max="90" value={form.bonusDays} onChange={set('bonusDays')} required /></label>
                        <label className="field">{t('account.admin.couponUntil')}<input type="date" value={form.validUntil} onChange={set('validUntil')} required /></label>
                        <label className="account-check"><input type="checkbox" checked={form.active} onChange={set('active')} /><span>{t('account.admin.couponActive')}</span></label>
                        {saveState.error && <p className="form-error" role="alert">{saveState.error}</p>}
                        <button type="submit" className="button button--primary field--wide" disabled={saveState.busy}>{t('account.admin.couponSave')}</button>
                    </form>
                </section>
            ) : <p className="muted">{t('account.admin.readOnly')}</p>}
            <Loaded state={state}>
                {({ items }) => (
                    <Table head={[t('account.admin.couponCode'), t('account.admin.couponDescription'), t('account.admin.couponAmount'), t('account.admin.couponMax'), t('account.admin.couponUntil'), t('account.admin.couponActive')]}
                        rows={items.map((c) => (
                            <tr key={c.id}><td><code>{c.code}</code></td><td>{c.description}</td><td className="num">{money(c.amount)}</td><td>{t('account.admin.couponUses', { used: c.redemptions, max: c.maxRedemptions })}</td><td>{formatDateTime(c.validUntil)}</td><td>{c.active ? '✓' : '—'}</td></tr>
                        ))} />
                )}
            </Loaded>
        </>
    )
}

function Errors() {
    const [state] = useAdminData(() => adminApi.errors())
    return (
        <Loaded state={state}>
            {({ items }) => (
                <Table head={[t('account.history.date'), t('account.admin.route'), t('account.admin.code'), t('account.admin.message')]}
                    rows={items.map((e) => <tr key={e.id}><td>{formatDateTime(e.createdAt)}</td><td><code>{e.route}</code></td><td>{e.code}</td><td>{e.message}</td></tr>)} />
            )}
        </Loaded>
    )
}

function Audit() {
    const [state] = useAdminData(() => adminApi.audit())
    return (
        <Loaded state={state}>
            {({ items }) => (
                <Table head={[t('account.history.date'), t('account.admin.action'), t('account.admin.actor'), t('account.admin.target'), t('account.history.details')]}
                    rows={items.map((e) => (
                        <tr key={e.id}><td>{formatDateTime(e.createdAt)}</td><td><code>{e.action}</code></td><td>{e.actorRole} {e.actorId ? <code title={e.actorId}>{e.actorId.slice(0, 8)}</code> : ''}</td><td>{e.targetUserId ? <code title={e.targetUserId}>{e.targetUserId.slice(0, 8)}</code> : '—'}</td><td><code>{JSON.stringify(e.details)}</code></td></tr>
                    ))} />
            )}
        </Loaded>
    )
}

function Catalog() {
    const [state] = useAdminData(() => adminApi.catalog())
    return (
        <Loaded state={state}>
            {(data) => (
                <>
                    <p>{t('casino.totals', data.totals)}</p>
                    <Table head={[t('casino.admin.columns.provider'), t('casino.admin.columns.status'), t('casino.admin.columns.games'), t('casino.admin.columns.demos')]}
                        rows={data.providers.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.status.integrated ? t('casino.status.integrated') : t('casino.status.pending')}</td><td className="num">{p.games}</td><td className="num">{p.executableGames}</td></tr>)} />
                </>
            )}
        </Loaded>
    )
}

const PANELS = { overview: Overview, users: Users, transactions: Transactions, gateway: Gateway, withdrawals: Withdrawals, coupons: Coupons, errors: Errors, audit: Audit, catalog: Catalog }

function Console() {
    const { isStaff } = useAuth()
    const [tab, setTab] = useState('overview')
    if (!isStaff) {
        return (
            <div className="state-panel">
                <Lock size={28} aria-hidden="true" />
                <h1>{t('account.admin.title')}</h1>
                <p>{t('account.admin.noAccess')}</p>
            </div>
        )
    }
    const Panel = PANELS[tab]
    return (
        <Page title={t('account.admin.title')}>
            <Chips label={t('account.admin.title')} value={tab} onChange={setTab} options={TABS.map((value) => ({ value, label: t(`account.admin.tabs.${value}`) }))} />
            <section className="page-section"><Panel /></section>
        </Page>
    )
}

export default function AdminConsole() {
    return <RequireAuth><Console /></RequireAuth>
}
