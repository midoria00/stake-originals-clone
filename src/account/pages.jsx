import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, BadgePercent, CirclePlus, History, Receipt, ShieldCheck, Ticket, Wallet } from 'lucide-react'
import Page, { Chips, EmptyState, useConfirm } from '../components/Page'
import { Coins } from '../brand/Brand'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { formatCoins, formatDate, formatDateTime, formatMultiplier, formatNumber } from '../i18n/format'
import { FREE_CREDIT_OPTIONS, FREE_CREDITS_CEILING } from '../wallet/ledger'
import { accountApi, centsToCoins, errorMessage } from './api'
import { useAuth } from './AuthContext'
import { AuthPanel, Avatar, maskEmail, PasswordField, RequireAuth, useSubmit } from './components'

const coins = (cents) => <Coins value={centsToCoins(cents)} />

function Signed({ main = 0, promo = 0 }) {
    const total = Number(main) + Number(promo)
    const cls = total > 0 ? 'account-amount--pos' : total < 0 ? 'account-amount--neg' : ''
    return (
        <span className={cls}>
            {total > 0 ? '+' : total < 0 ? '−' : ''}{formatCoins(Math.abs(centsToCoins(main)))}
            {Number(promo) !== 0 && <span className="muted"> ({promo > 0 ? '+' : '−'}{formatCoins(Math.abs(centsToCoins(promo)))} {t('account.history.promo')})</span>}
        </span>
    )
}

function Busy() {
    return <div className="page-skeleton" role="status" aria-label={t('common.loading')}><span className="skeleton skeleton--line" /></div>
}

// Loads data once and on demand; errors become a message instead of a blank page.
function useLoad(loader, deps = []) {
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

// Sign-in, sign-up and recovery as pages --------------------------------------------------------

const AUTH_PATHS = { login: '/entrar', signup: '/criar-conta', recover: '/recuperar-senha' }

export function AuthPage({ mode }) {
    const navigate = useNavigate()
    const { status } = useAuth()
    useEffect(() => {
        if (status === 'authenticated') navigate('/conta', { replace: true })
    }, [status, navigate])
    const title = { login: 'account.login.title', signup: 'account.signup.title', recover: 'account.recover.title' }[mode]
    const subtitle = { login: 'account.login.subtitle', signup: 'account.signup.subtitle' }[mode]
    return (
        <Page title={t(title)} subtitle={subtitle ? t(subtitle) : undefined} narrow>
            <section className="panel">
                <AuthPanel mode={mode} onSwitch={(next) => navigate(AUTH_PATHS[next])} onDone={() => navigate('/conta')} />
            </section>
        </Page>
    )
}

// Links from e-mails: ?token_hash=...&type=... (recommended templates) or #access_token=... (defaults).
function linkCredentials(location) {
    const query = new URLSearchParams(location.search)
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
    const type = query.get('type') ?? hash.get('type') ?? undefined
    if (query.get('token_hash')) return { tokenHash: query.get('token_hash'), type }
    if (hash.get('access_token') && hash.get('refresh_token')) {
        return { accessToken: hash.get('access_token'), refreshToken: hash.get('refresh_token'), expiresIn: Number(hash.get('expires_in')) || 3600 }
    }
    return null
}

export function ConfirmPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { signedIn } = useAuth()
    const [state, setState] = useState({ phase: 'working', message: '' })
    useEffect(() => {
        const credentials = linkCredentials(location)
        // Tokens must not linger in the address bar or the history.
        window.history.replaceState(null, '', location.pathname)
        if (!credentials) return setState({ phase: 'error', message: t('account.confirm.missingLink') })
        let cancelled = false
        accountApi.confirm(credentials)
            .then((me) => {
                if (cancelled) return
                if (me.status === 'email_change_pending') return setState({ phase: 'done', message: t('account.confirm.emailChangePending') })
                signedIn(me)
                setState({ phase: 'done', message: t(me.status === 'email_changed' ? 'account.confirm.emailChanged' : 'account.confirm.done') })
                setTimeout(() => navigate('/conta', { replace: true }), 1200)
            })
            .catch(() => !cancelled && setState({ phase: 'error', message: t('account.confirm.failed') }))
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
        <Page title={t('account.confirm.title')} narrow>
            <section className="panel" role="status">
                <p>{state.phase === 'working' ? t('account.confirm.working') : state.message}</p>
                {state.phase === 'error' && <Link className="button button--ghost" to="/entrar">{t('account.signIn')}</Link>}
            </section>
        </Page>
    )
}

export function ResetPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const { signedIn } = useAuth()
    const id = useId()
    const [credentials] = useState(() => linkCredentials(location))
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    useEffect(() => { window.history.replaceState(null, '', location.pathname) }, [location.pathname])
    const [state, submit] = useSubmit(async () => {
        const me = await accountApi.reset({ ...credentials, password, passwordConfirm: confirm })
        signedIn(me)
        navigate('/conta', { replace: true })
    })
    return (
        <Page title={t('account.reset.title')} subtitle={t('account.reset.subtitle')} narrow>
            <section className="panel">
                {!credentials ? <p>{t('account.reset.missingLink')}</p> : (
                    <form className="account-form" onSubmit={submit} noValidate>
                        <PasswordField id={`${id}-p`} label={t('account.security.newPassword')} value={password} onChange={setPassword} autoComplete="new-password" hint={t('account.form.passwordHint')} />
                        <PasswordField id={`${id}-c`} label={t('account.form.passwordConfirm')} value={confirm} onChange={setConfirm} autoComplete="new-password" />
                        {state.error && <p className="form-error" role="alert">{state.error}</p>}
                        <button type="submit" className="button button--primary account-form__submit" disabled={state.busy}>{t('account.form.submitReset')}</button>
                    </form>
                )}
            </section>
        </Page>
    )
}

// Minha conta -------------------------------------------------------------------------------------

const QUICK = [
    { to: '/conta/carteira', key: 'wallet', Icon: Wallet },
    { to: '/conta/adicionar-creditos', key: 'addCredits', Icon: CirclePlus },
    { to: '/conta/historico', key: 'history', Icon: History },
    { to: '/conta/historico?aba=movimentacoes', key: 'transactions', Icon: ArrowLeftRight },
    { to: '/conta/cupons', key: 'coupons', Icon: Ticket },
    { to: '/conta/cashback', key: 'cashback', Icon: BadgePercent },
    { to: '/minhas-apostas', key: 'myBets', Icon: Receipt },
    { to: '/conta/seguranca', key: 'security', Icon: ShieldCheck },
]

function AccountOverview() {
    const { me, updateMe } = useAuth()
    const { showToast } = useWallet()
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(me.profile.fullName)
    const [state, submit] = useSubmit(async () => {
        const summary = await accountApi.updateProfile(name)
        updateMe({ profile: summary.profile })
        setEditing(false)
        showToast('win', t('account.page.saved'))
    })
    const { profile, user } = me
    return (
        <Page title={t('account.page.accountTitle')} subtitle={t('account.page.accountSubtitle')} narrow>
            <section className="panel account-hero">
                <Avatar name={profile.username} size={64} />
                <div>
                    <h2>@{profile.username}</h2>
                    <p>{profile.fullName}</p>
                    <p className="muted">{maskEmail(user.email)} · {t('account.page.memberSince', { date: formatDate(profile.createdAt) })}</p>
                    <p>
                        <span className="account-badge">{t(`account.page.role.${profile.role}`)}</span>{' '}
                        {!user.emailConfirmed && <span className="account-badge account-badge--warn">{t('account.page.emailUnverified')}</span>}
                    </p>
                </div>
            </section>
            <section className="panel">
                <h2>{t('account.form.fullName')}</h2>
                {editing ? (
                    <form className="account-inline-form" onSubmit={submit}>
                        <label className="field">{t('account.form.fullName')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required /></label>
                        <button type="submit" className="button button--primary" disabled={state.busy}>{t('account.page.save')}</button>
                        <button type="button" className="button button--ghost" onClick={() => setEditing(false)}>{t('account.page.cancel')}</button>
                        {state.error && <p className="form-error" role="alert">{state.error}</p>}
                    </form>
                ) : (
                    <div className="settings-row">
                        <span>{profile.fullName}</span>
                        <button type="button" className="button button--ghost button--small" onClick={() => setEditing(true)}>{t('account.page.editName')}</button>
                    </div>
                )}
            </section>
            <EmailChange currentEmail={user.email} />
            <section className="page-section">
                <div className="page-section__head"><h2>{t('account.page.quickLinks')}</h2></div>
                <nav className="account-links" aria-label={t('account.page.quickLinks')}>
                    {QUICK.map(({ to, key, Icon }) => <Link key={key} to={to}><Icon size={18} aria-hidden="true" />{t(`account.menu.${key}`)}</Link>)}
                </nav>
            </section>
        </Page>
    )
}

// Supabase sends a link to the current and to the new address; both must be opened.
function EmailChange({ currentEmail }) {
    const id = useId()
    const [open, setOpen] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [sent, setSent] = useState(false)
    const [state, submit] = useSubmit(async () => {
        await accountApi.changeEmail({ newEmail: email, password })
        setSent(true)
        setPassword('')
    })
    return (
        <section className="panel">
            <h2>{t('account.page.emailTitle')}</h2>
            <div className="settings-row">
                <span>{maskEmail(currentEmail)}</span>
                {!open && <button type="button" className="button button--ghost button--small" onClick={() => setOpen(true)}>{t('account.page.changeEmail')}</button>}
            </div>
            {open && (sent ? <p className="account-success" role="status">{t('account.page.emailChangeSent')}</p> : (
                <form className="account-form" onSubmit={submit} noValidate>
                    <label className="field field--wide" htmlFor={`${id}-email`}>
                        {t('account.page.newEmail')}
                        <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
                    </label>
                    <PasswordField id={`${id}-pw`} label={t('account.security.currentPassword')} value={password} onChange={setPassword} autoComplete="current-password" />
                    <p className="account-hint">{t('account.page.emailChangeHint')}</p>
                    {state.error && <p className="form-error" role="alert">{state.error}</p>}
                    <div className="page__actions">
                        <button type="submit" className="button button--primary" disabled={state.busy}>{t('account.page.changeEmail')}</button>
                        <button type="button" className="button button--ghost" onClick={() => setOpen(false)}>{t('account.page.cancel')}</button>
                    </div>
                </form>
            ))}
        </section>
    )
}

export const AccountPage = () => <RequireAuth><AccountOverview /></RequireAuth>

// Carteira ----------------------------------------------------------------------------------------

function FreeCredits() {
    const { addFreeCredits, showToast } = useWallet()
    const [busy, setBusy] = useState(false)
    const add = async (amount) => {
        setBusy(true)
        const ok = await addFreeCredits(amount)
        setBusy(false)
        if (ok) showToast('win', t('wallet.addedTitle'), t('account.wallet.added', { amount: formatNumber(amount) }))
        else showToast('error', t('wallet.addFree'), t('account.errors.ceiling_reached'))
    }
    return (
        <section className="panel">
            <h2>{t('account.wallet.free')}</h2>
            <p>{t('account.wallet.freeBody', { limit: formatNumber(FREE_CREDITS_CEILING) })}</p>
            <div className="chip-row">
                {FREE_CREDIT_OPTIONS.map((amount) => (
                    <button key={amount} type="button" className="button button--ghost button--small" disabled={busy} onClick={() => add(amount)}>+{formatNumber(amount)}</button>
                ))}
            </div>
        </section>
    )
}

function ServerWallet() {
    const { mainBalance, promoBalance } = useWallet()
    const { updateWallet } = useAuth()
    const [state] = useLoad(async () => {
        const data = await accountApi.wallet()
        updateWallet(data.wallet)
        return data
    })
    return (
        <Page title={t('account.wallet.title')} subtitle={t('account.wallet.subtitle')}>
            <div className="stat-grid">
                <dl className="stat"><dt>{t('account.mainBalance')}</dt><dd><Coins value={mainBalance} size={20} /></dd></dl>
                <dl className="stat"><dt>{t('account.bonusBalance')}</dt><dd><Coins value={promoBalance} size={20} /></dd></dl>
            </div>
            <p className="muted">{t('account.coinsNote')}</p>
            <FreeCredits />
            <section className="panel">
                <h2>{t('account.wallet.bonusTitle')}</h2>
                {state.data?.bonuses?.length ? (
                    <ul className="plain-list">
                        {state.data.bonuses.map((bonus) => (
                            <li key={bonus.id}>
                                <span><strong>{t('account.wallet.bonusRemaining', { remaining: formatCoins(centsToCoins(bonus.remaining)), amount: formatCoins(centsToCoins(bonus.amount)) })}</strong><br /><span className="muted">{bonus.conditions}</span></span>
                                <span className="muted">{t('account.wallet.bonusExpires', { date: formatDateTime(bonus.expiresAt) })}</span>
                            </li>
                        ))}
                    </ul>
                ) : <p className="muted">{t('account.wallet.noBonus')}</p>}
            </section>
            <section className="page-section">
                <div className="page-section__head"><h2>{t('account.wallet.statsTitle')}</h2></div>
                {state.loading ? <Busy /> : state.error ? <p className="form-error">{state.error}</p> : <GameStats stats={state.data.stats} />}
            </section>
            <section className="panel">
                <h2>{t('account.wallet.withdrawTitle')}</h2>
                <p>{t('account.wallet.withdrawBody')}</p>
            </section>
        </Page>
    )
}

function GameStats({ stats }) {
    const rows = [...stats.games.map((g) => ({ ...g, label: t(`account.history.origins.${g.game}`) }))]
    if (stats.sports.bets > 0) rows.push({ game: 'sports', label: t('account.wallet.sports'), rounds: stats.sports.bets, wagered: stats.sports.wagered, returned: stats.sports.returned, net: stats.sports.returned - stats.sports.wagered, biggestPayout: null })
    if (!rows.length) return <p className="muted">{t('account.wallet.noStats')}</p>
    return (
        <div className="table-wrap">
            <table className="data-table">
                <thead><tr><th>{t('account.wallet.game')}</th><th className="num">{t('account.wallet.rounds')}</th><th className="num">{t('account.wallet.wagered')}</th><th className="num">{t('account.wallet.returned')}</th><th className="num">{t('account.wallet.net')}</th><th className="num">{t('account.wallet.biggest')}</th></tr></thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.game}>
                            <td>{row.label}</td>
                            <td className="num">{formatNumber(row.rounds)}</td>
                            <td className="num">{formatCoins(centsToCoins(row.wagered))}</td>
                            <td className="num">{formatCoins(centsToCoins(row.returned))}</td>
                            <td className="num"><Signed main={row.net} /></td>
                            <td className="num">{row.biggestPayout === null ? '—' : formatCoins(centsToCoins(row.biggestPayout))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export const AccountWalletPage = () => <RequireAuth><ServerWallet /></RequireAuth>

// Adicionar créditos (free credits + payment sandbox) ---------------------------------------------

const SANDBOX_ACTIONS = { pending: ['confirm', 'fail', 'cancel', 'expire'], confirmed: ['refund'] }

function PaymentSandbox() {
    const id = useId()
    const { showToast } = useWallet()
    const [method, setMethod] = useState('pix_simulado')
    const [amount, setAmount] = useState('50,00')
    const [selected, setSelected] = useState(null)
    const [list, reload] = useLoad(() => accountApi.payments())
    const [detail, setDetail] = useState(null)
    const open = async (paymentId) => {
        setSelected(paymentId)
        try { setDetail(await accountApi.payment(paymentId)) } catch (error) { showToast('error', errorMessage(error)) }
    }
    const [createState, create] = useSubmit(async () => {
        const created = await accountApi.createPayment(method, amount)
        await reload()
        await open(created.attempt.id)
    })
    const act = async (action) => {
        try {
            const result = await accountApi.simulatePayment(selected, action)
            setDetail((previous) => ({ ...previous, ...result }))
            showToast(result.outcome.outcome === 'applied' ? 'win' : 'bet', t(`account.addCredits.outcome.${result.outcome.outcome}`), t('account.addCredits.noBalanceEffect'))
            reload()
        } catch (error) {
            showToast('error', errorMessage(error))
        }
    }
    return (
        <section className="panel account-sandbox" aria-labelledby={`${id}-title`}>
            <span className="account-sandbox__tag">Sandbox</span>
            <h2 id={`${id}-title`}>{t('account.addCredits.sandboxTitle')}</h2>
            <p>{t('account.addCredits.sandboxBody')}</p>
            <form className="account-inline-form" onSubmit={create}>
                <label className="field">{t('account.addCredits.method')}
                    <select value={method} onChange={(e) => setMethod(e.target.value)}>
                        {['pix_simulado', 'cartao_simulado'].map((m) => <option key={m} value={m}>{t(`account.addCredits.methods.${m}`)}</option>)}
                    </select>
                </label>
                <label className="field">{t('account.addCredits.amount')}
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-describedby={`${id}-amount`} />
                </label>
                <button type="submit" className="button button--primary" disabled={createState.busy}>{t('account.addCredits.create')}</button>
                <span id={`${id}-amount`} className="account-hint field--wide">{t('account.addCredits.amountHint')}</span>
                {createState.error && <p className="form-error" role="alert">{createState.error}</p>}
            </form>
            {detail && (
                <div className="panel" aria-live="polite">
                    <p><strong>{t(`account.addCredits.methods.${detail.attempt.method}`)}</strong> · R$ {formatCoins(detail.attempt.amountCents / 100)} · <span className="account-badge">{t(`account.addCredits.status.${detail.attempt.status}`)}</span></p>
                    {detail.instructions && <p className="muted">{t('account.addCredits.reference')}: <code>{detail.instructions.reference}</code> · {detail.instructions.notice}</p>}
                    <p className="muted">{t('account.addCredits.expires', { date: formatDateTime(detail.attempt.expiresAt) })}</p>
                    <div className="chip-row">
                        {(SANDBOX_ACTIONS[detail.attempt.status] ?? []).map((action) => (
                            <button key={action} type="button" className="button button--ghost button--small" onClick={() => act(action)}>{t(`account.addCredits.actions.${action}`)}</button>
                        ))}
                    </div>
                    {detail.events?.length > 0 && (
                        <>
                            <h3>{t('account.addCredits.events')}</h3>
                            <ul className="plain-list">
                                {detail.events.map((event) => (
                                    <li key={event.eventId}><span><code>{event.type}</code> · {t(`account.addCredits.outcome.${event.outcome}`)}</span><span className="muted">{formatDateTime(event.receivedAt)}</span></li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
            <h3>{t('account.addCredits.recent')}</h3>
            {list.loading ? <Busy /> : !list.data?.items?.length ? <p className="muted">{t('account.addCredits.none')}</p> : (
                <ul className="plain-list">
                    {list.data.items.map((p) => (
                        <li key={p.id}>
                            <button type="button" className="link-button" onClick={() => open(p.id)}>{t(`account.addCredits.methods.${p.method}`)} · R$ {formatCoins(p.amountCents / 100)}</button>
                            <span><span className="account-badge">{t(`account.addCredits.status.${p.status}`)}</span> <span className="muted">{formatDateTime(p.createdAt)}</span></span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

export const AddCreditsPage = () => (
    <RequireAuth>
        <Page title={t('account.addCredits.title')} subtitle={t('account.addCredits.subtitle')} narrow>
            <FreeCredits />
            <PaymentSandbox />
        </Page>
    </RequireAuth>
)

// Histórico ---------------------------------------------------------------------------------------

const TABS = [
    { value: 'movimentacoes', key: 'transactions' },
    { value: 'rodadas', key: 'rounds' },
    { value: 'esportes', key: 'sports' },
    { value: 'gratuitas', key: 'free' },
    { value: 'bonus', key: 'bonus' },
    { value: 'gateway', key: 'gateway' },
]
const TX_TYPES = ['welcome', 'free_credit', 'bet', 'win', 'refund', 'bonus', 'bonus_expired', 'admin_adjustment']
const ORIGINS = ['crash', 'plinko', 'mines', 'dino', 'dice', 'limbo', 'sports', 'wallet', 'coupon', 'cashback', 'admin', 'system']
const GAMES = ['crash', 'plinko', 'mines', 'dino', 'dice', 'limbo']

// Cursor-paged list: first page on filter change, "Carregar mais" appends.
function usePaged(fetchPage, key) {
    const [state, setState] = useState({ items: [], next: null, loading: true, error: '' })
    const load = useCallback(async (cursor) => {
        setState((previous) => ({ ...previous, loading: true, error: '' }))
        try {
            const page = await fetchPage(cursor)
            setState((previous) => ({ items: cursor ? [...previous.items, ...page.items] : page.items, next: page.nextCursor, loading: false, error: '' }))
        } catch (error) {
            setState((previous) => ({ ...previous, loading: false, error: errorMessage(error) }))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    useEffect(() => { load(null) }, [load])
    return { ...state, more: () => load(state.next) }
}

function MoreButton({ paged }) {
    if (paged.error) return <p className="form-error" role="alert">{paged.error}</p>
    if (!paged.next) return null
    return <div className="account-more"><button type="button" className="button button--ghost" onClick={paged.more} disabled={paged.loading}>{t('account.history.loadMore')}</button></div>
}

function TransactionsTab({ fixedTypes }) {
    const [type, setType] = useState('')
    const [origin, setOrigin] = useState('')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const types = fixedTypes ?? (type || undefined)
    const toEnd = to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined
    const paged = usePaged((cursor) => accountApi.transactions({ types, origins: origin || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: toEnd, cursor, limit: 25 }), `${types}|${origin}|${from}|${to}`)
    return (
        <>
            <div className="account-filters">
                {!fixedTypes && (
                    <label className="field">{t('account.history.type')}
                        <select value={type} onChange={(e) => setType(e.target.value)}>
                            <option value="">{t('account.history.allTypes')}</option>
                            {TX_TYPES.map((v) => <option key={v} value={v}>{t(`account.history.types.${v}`)}</option>)}
                        </select>
                    </label>
                )}
                <label className="field">{t('account.history.origin')}
                    <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                        <option value="">{t('account.history.allTypes')}</option>
                        {ORIGINS.map((v) => <option key={v} value={v}>{t(`account.history.origins.${v}`)}</option>)}
                    </select>
                </label>
                <label className="field">{t('account.history.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="field">{t('account.history.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            {paged.loading && !paged.items.length ? <Busy /> : !paged.items.length ? <EmptyState text={t('account.history.empty')} /> : (
                <div className="table-wrap">
                    <table className="data-table">
                        <thead><tr><th>{t('account.history.date')}</th><th>{t('account.history.type')}</th><th>{t('account.history.origin')}</th><th className="num">{t('account.history.amount')}</th><th className="num">{t('account.history.balanceAfter')}</th><th>{t('account.history.status')}</th><th>{t('account.history.id')}</th></tr></thead>
                        <tbody>
                            {paged.items.map((tx) => (
                                <tr key={tx.id}>
                                    <td>{formatDateTime(tx.createdAt)}</td>
                                    <td>{t(`account.history.types.${tx.type}`)}</td>
                                    <td>{t(`account.history.origins.${tx.origin}`)}</td>
                                    <td className="num"><Signed main={tx.amount} promo={tx.promoAmount} /></td>
                                    <td className="num">{formatCoins(centsToCoins(tx.balanceAfter))}{tx.promoBalanceAfter > 0 && <span className="muted"> +{formatCoins(centsToCoins(tx.promoBalanceAfter))}</span>}</td>
                                    <td>{t('account.history.posted')}</td>
                                    <td><code title={tx.id}>{tx.id.slice(0, 8)}</code></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <MoreButton paged={paged} />
        </>
    )
}

function roundDetails(round) {
    const r = round.result ?? {}
    switch (round.game) {
        case 'dice': return `${round.params.direction === 'over' ? '>' : '<'} ${round.params.target} · ${r.roll ?? '—'}`
        case 'limbo': return `${formatMultiplier(round.params.target)} · ${r.result !== undefined ? formatMultiplier(r.result) : '—'}`
        case 'plinko': return `${round.params.rows} · ${round.params.risk} · ${r.multiplier !== undefined ? formatMultiplier(r.multiplier) : '—'}`
        case 'mines': return `${round.params.mines} · ${(r.revealed ?? round.state.revealed ?? []).length}`
        case 'crash': return r.crashPoint ? `${formatMultiplier(r.crashPoint)}${r.cashedOutAt ? ` · ${formatMultiplier(r.cashedOutAt)}` : ''}` : '—'
        case 'dino': return `${round.params.difficulty} · ${r.cleared ?? round.state.cleared ?? 0}`
        default: return ''
    }
}

function RoundsTab() {
    const [game, setGame] = useState('')
    const paged = usePaged((cursor) => accountApi.rounds({ game: game || undefined, cursor, limit: 25 }), game)
    return (
        <>
            <div className="account-filters">
                <label className="field">{t('account.wallet.game')}
                    <select value={game} onChange={(e) => setGame(e.target.value)}>
                        <option value="">{t('account.history.allGames')}</option>
                        {GAMES.map((g) => <option key={g} value={g}>{t(`account.history.origins.${g}`)}</option>)}
                    </select>
                </label>
            </div>
            {paged.loading && !paged.items.length ? <Busy /> : !paged.items.length ? <EmptyState text={t('account.history.empty')} /> : (
                <div className="table-wrap">
                    <table className="data-table">
                        <thead><tr><th>{t('account.history.date')}</th><th>{t('account.wallet.game')}</th><th className="num">{t('account.history.stake')}</th><th className="num">{t('account.history.payout')}</th><th className="num">{t('account.history.multiplier')}</th><th>{t('account.history.details')}</th><th>{t('account.history.status')}</th><th>{t('account.history.id')}</th></tr></thead>
                        <tbody>
                            {paged.items.map((round) => (
                                <tr key={round.id}>
                                    <td>{formatDateTime(round.createdAt)}</td>
                                    <td>{t(`account.history.origins.${round.game}`)}</td>
                                    <td className="num">{coins(round.stake)}</td>
                                    <td className="num">{coins(round.payout)}</td>
                                    <td className="num">{round.multiplierBp ? formatMultiplier(round.multiplierBp / 10000) : '—'}</td>
                                    <td>{roundDetails(round)}</td>
                                    <td>{round.status === 'open' ? t('account.history.open') : t('account.history.settled')}</td>
                                    <td><code title={round.id}>{round.id.slice(0, 8)}</code></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <MoreButton paged={paged} />
        </>
    )
}

function SportsTab() {
    const [status, setStatus] = useState('')
    const paged = usePaged((cursor) => accountApi.sportsBets({ status: status || undefined, cursor, limit: 25 }), status)
    return (
        <>
            <Chips label={t('account.history.status')} value={status} onChange={setStatus}
                options={[{ value: '', label: t('account.history.allStatuses') }, ...['open', 'won', 'lost', 'void', 'partial'].map((v) => ({ value: v, label: t(`account.history.betStatus.${v}`) }))]} />
            {paged.loading && !paged.items.length ? <Busy /> : !paged.items.length ? <EmptyState text={t('account.history.empty')} /> : (
                <ul className="plain-list">
                    {paged.items.map((bet) => (
                        <li key={bet.id}>
                            <span>
                                <strong>{bet.selections.map((s) => s.selectionLabel).join(' + ')}</strong><br />
                                <span className="muted">{bet.selections.map((s) => `${s.matchLabel} (${(s.oddsBp / 10000).toFixed(2)})`).join(' · ')}</span>
                            </span>
                            <span>{coins(bet.stake)} → {coins(bet.status === 'open' ? bet.potentialPayout : bet.payout)} <span className="account-badge">{t(`account.history.betStatus.${bet.status}`)}</span><br /><span className="muted">{formatDateTime(bet.createdAt)}</span></span>
                        </li>
                    ))}
                </ul>
            )}
            <MoreButton paged={paged} />
        </>
    )
}

function GatewayTab() {
    const [state] = useLoad(() => accountApi.payments())
    if (state.loading) return <Busy />
    if (state.error) return <p className="form-error">{state.error}</p>
    if (!state.data.items.length) return <EmptyState text={t('account.addCredits.none')} />
    return (
        <>
            <p className="muted">{t('account.addCredits.sandboxBody')}</p>
            <div className="table-wrap">
                <table className="data-table">
                    <thead><tr><th>{t('account.history.date')}</th><th>{t('account.addCredits.method')}</th><th className="num">{t('account.addCredits.amount')}</th><th>{t('account.history.status')}</th><th>{t('account.history.id')}</th></tr></thead>
                    <tbody>
                        {state.data.items.map((p) => (
                            <tr key={p.id}>
                                <td>{formatDateTime(p.createdAt)}</td>
                                <td>{t(`account.addCredits.methods.${p.method}`)}</td>
                                <td className="num">R$ {formatCoins(p.amountCents / 100)}</td>
                                <td>{t(`account.addCredits.status.${p.status}`)}</td>
                                <td><code title={p.providerRef}>{p.id.slice(0, 8)}</code></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}

function HistoryView() {
    const [params, setParams] = useSearchParams()
    const tab = TABS.some((item) => item.value === params.get('aba')) ? params.get('aba') : 'movimentacoes'
    return (
        <Page title={t('account.history.title')} subtitle={t('account.history.subtitle')}>
            <Chips label={t('account.history.title')} value={tab} onChange={(value) => setParams({ aba: value }, { replace: true })}
                options={TABS.map((item) => ({ value: item.value, label: t(`account.history.tabs.${item.key}`) }))} />
            <section className="page-section">
                {tab === 'movimentacoes' && <TransactionsTab key="all" />}
                {tab === 'rodadas' && <RoundsTab />}
                {tab === 'esportes' && <SportsTab />}
                {tab === 'gratuitas' && <TransactionsTab key="free" fixedTypes="free_credit,welcome" />}
                {tab === 'bonus' && <TransactionsTab key="bonus" fixedTypes="bonus,bonus_expired" />}
                {tab === 'gateway' && <GatewayTab />}
            </section>
        </Page>
    )
}

export const HistoryPage = () => <RequireAuth><HistoryView /></RequireAuth>

// Cupons e cashback -------------------------------------------------------------------------------

function CouponsView() {
    const { updateWallet } = useAuth()
    const { showToast } = useWallet()
    const [code, setCode] = useState('')
    const [data, reload] = useLoad(() => accountApi.promotions())
    const [state, submit] = useSubmit(async () => {
        const result = await accountApi.redeemCoupon(code.trim())
        updateWallet(result.wallet)
        setCode('')
        showToast('win', t('account.coupons.redeemed', { amount: formatCoins(centsToCoins(result.bonus.amount)) }))
        reload()
    })
    return (
        <Page title={t('account.coupons.title')} subtitle={t('account.coupons.subtitle')} narrow>
            <section className="panel">
                <form className="account-inline-form" onSubmit={submit}>
                    <label className="field">{t('account.coupons.code')}<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={24} autoComplete="off" required /></label>
                    <button type="submit" className="button button--primary" disabled={state.busy || code.trim().length < 4}>{t('account.coupons.redeem')}</button>
                    {state.error && <p className="form-error" role="alert">{state.error}</p>}
                </form>
                <p className="account-hint">{t('account.coupons.rules')}</p>
            </section>
            <section className="page-section">
                <div className="page-section__head"><h2>{t('account.coupons.history')}</h2></div>
                {data.loading ? <Busy /> : !data.data?.redemptions?.length ? <p className="muted">{t('account.coupons.none')}</p> : (
                    <ul className="plain-list">
                        {data.data.redemptions.map((r) => (
                            <li key={r.id}><span><strong>{r.code}</strong> · {r.description}</span><span>{coins(r.amount)} <span className="muted">{formatDateTime(r.createdAt)}</span></span></li>
                        ))}
                    </ul>
                )}
            </section>
        </Page>
    )
}

export const CouponsPage = () => <RequireAuth><CouponsView /></RequireAuth>

function CashbackView() {
    const { updateWallet } = useAuth()
    const { showToast } = useWallet()
    const [data, reload] = useLoad(() => accountApi.promotions())
    const [state, claim] = useSubmit(async () => {
        const result = await accountApi.claimCashback()
        updateWallet(result.wallet)
        showToast('win', t('account.cashback.done', { amount: formatCoins(centsToCoins(result.history[0]?.amount ?? 0)) }))
        reload()
    })
    const cashback = data.data?.cashback
    return (
        <Page title={t('account.cashback.title')} subtitle={t('account.cashback.subtitle')} narrow>
            {data.loading ? <Busy /> : data.error ? <p className="form-error">{data.error}</p> : (
                <>
                    <section className="panel">
                        <h2>{t('account.cashback.week', { date: formatDate(`${cashback.weekStart}T12:00:00`) })}</h2>
                        <div className="stat-grid">
                            <dl className="stat"><dt>{t('account.cashback.wagered')}</dt><dd>{coins(cashback.wagered)}</dd></dl>
                            <dl className="stat"><dt>{t('account.cashback.amount')}</dt><dd>{coins(cashback.amount)}</dd></dl>
                        </div>
                        {cashback.claimed ? <p>{t('account.cashback.claimed')}</p> : cashback.amount > 0 ? (
                            <button type="button" className="button button--primary" onClick={claim} disabled={state.busy}>{t('account.cashback.claim')}</button>
                        ) : <p className="muted">{t('account.cashback.unavailable')}</p>}
                        {state.error && <p className="form-error" role="alert">{state.error}</p>}
                        <p className="account-hint">{t('account.cashback.conditions')}</p>
                    </section>
                    <section className="page-section">
                        <div className="page-section__head"><h2>{t('account.cashback.history')}</h2></div>
                        {!cashback.history.length ? <p className="muted">{t('account.history.empty')}</p> : (
                            <ul className="plain-list">
                                {cashback.history.map((h) => <li key={h.weekStart}><span>{t('account.cashback.week', { date: formatDate(`${h.weekStart}T12:00:00`) })}</span><span>{coins(h.amount)}</span></li>)}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </Page>
    )
}

export const CashbackPage = () => <RequireAuth><CashbackView /></RequireAuth>

// Segurança e LGPD --------------------------------------------------------------------------------

function SecurityView() {
    const id = useId()
    const navigate = useNavigate()
    const confirm = useConfirm()
    const { logout, refresh } = useAuth()
    const { showToast } = useWallet()
    const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
    const [del, setDel] = useState({ password: '', confirmation: '' })
    const [pwState, changePassword] = useSubmit(async () => {
        await accountApi.changePassword({ currentPassword: pw.current, newPassword: pw.next, passwordConfirm: pw.confirm })
        setPw({ current: '', next: '', confirm: '' })
        showToast('win', t('account.security.passwordChanged'))
    })
    const logoutAll = () => confirm({
        title: t('account.security.logoutAll'),
        content: t('account.security.sessionsBody'),
        onOk: async () => {
            await accountApi.logoutAll().catch(() => {})
            await refresh()
            navigate('/')
        },
    })
    const [delState, remove] = useSubmit(async () => {
        await accountApi.deleteAccount(del)
        await logout()
        showToast('bet', t('account.security.deleted'))
        navigate('/')
    })
    return (
        <Page title={t('account.security.title')} subtitle={t('account.security.subtitle')} narrow>
            <section className="panel">
                <h2>{t('account.security.changePassword')}</h2>
                <form className="account-form" onSubmit={changePassword} noValidate>
                    <PasswordField id={`${id}-cur`} label={t('account.security.currentPassword')} value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} autoComplete="current-password" />
                    <PasswordField id={`${id}-new`} label={t('account.security.newPassword')} value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" hint={t('account.form.passwordHint')} />
                    <PasswordField id={`${id}-cnf`} label={t('account.form.passwordConfirm')} value={pw.confirm} onChange={(v) => setPw((p) => ({ ...p, confirm: v }))} autoComplete="new-password" />
                    {pwState.error && <p className="form-error" role="alert">{pwState.error}</p>}
                    <button type="submit" className="button button--primary" disabled={pwState.busy}>{t('account.security.changePassword')}</button>
                </form>
            </section>
            <section className="panel">
                <h2>{t('account.security.sessions')}</h2>
                <p>{t('account.security.sessionsBody')}</p>
                <button type="button" className="button button--ghost" onClick={logoutAll}>{t('account.security.logoutAll')}</button>
            </section>
            <section className="panel">
                <h2>{t('account.security.privacyTitle')}</h2>
                <p>{t('account.security.exportBody')}</p>
                <a className="button button--ghost" href="/api/app/account/export" download>{t('account.security.export')}</a>
            </section>
            <section className="panel account-danger">
                <h2>{t('account.security.deleteTitle')}</h2>
                <p>{t('account.security.deleteBody')}</p>
                <form className="account-form" onSubmit={remove} noValidate>
                    <PasswordField id={`${id}-del`} label={t('account.security.currentPassword')} value={del.password} onChange={(v) => setDel((d) => ({ ...d, password: v }))} autoComplete="current-password" />
                    <label className="field field--wide">{t('account.security.deleteConfirm')}<input value={del.confirmation} onChange={(e) => setDel((d) => ({ ...d, confirmation: e.target.value }))} autoComplete="off" /></label>
                    {delState.error && <p className="form-error" role="alert">{delState.error}</p>}
                    <button type="submit" className="button button--danger" disabled={delState.busy || del.confirmation !== 'EXCLUIR'}>{t('account.security.deleteButton')}</button>
                </form>
            </section>
        </Page>
    )
}

export const SecurityPage = () => <RequireAuth><SecurityView /></RequireAuth>

export function WithdrawalsPage() {
    return (
        <Page title={t('account.withdrawals.title')} narrow>
            <section className="panel"><p>{t('account.withdrawals.unavailable')}</p></section>
        </Page>
    )
}

// Account preferences shown inside Configurações when signed in.
export function AccountSettingsPanel() {
    const { me, isAuthenticated, updateMe } = useAuth()
    const { showToast } = useWallet()
    if (!isAuthenticated) return null
    const settings = me.settings
    const save = async (patch) => {
        try {
            const summary = await accountApi.updateSettings(patch)
            updateMe({ settings: summary.settings })
            showToast('win', t('account.settings.saved'))
        } catch (error) {
            showToast('error', errorMessage(error))
        }
    }
    return (
        <section className="panel" aria-labelledby="account-settings">
            <h2 id="account-settings">{t('account.settings.title')}</h2>
            {['hideBalance', 'reducedMotion', 'sound'].map((key) => (
                <label key={key} className="settings-row account-check">
                    <input type="checkbox" checked={Boolean(settings[key])} onChange={(e) => save({ [key]: e.target.checked })} />
                    <span>{t(`account.settings.${key}`)}</span>
                </label>
            ))}
            <label className="field">{t('account.settings.reminder')}
                <select value={settings.sessionReminderMinutes} onChange={(e) => save({ sessionReminderMinutes: Number(e.target.value) })}>
                    {[0, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m === 0 ? t('account.settings.reminderOff') : t('account.settings.reminderMinutes', { minutes: m })}</option>)}
                </select>
            </label>
        </section>
    )
}
