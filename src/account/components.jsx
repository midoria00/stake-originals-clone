import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Modal } from 'antd'
import {
    ArrowLeftRight, BadgePercent, CirclePlus, Eye, EyeOff, History, LayoutDashboard, LifeBuoy, LogOut, Receipt,
    Settings, ShieldCheck, Star, Ticket, UserRound, Wallet,
} from 'lucide-react'
import { Coins } from '../brand/Brand'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { formatCoins } from '../i18n/format'
import { accountApi, errorMessage } from './api'
import { useAuth } from './AuthContext'
import './account.css'

export function maskEmail(email) {
    if (!email || !email.includes('@')) return ''
    const [name, domain] = email.split('@')
    return `${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 2))}@${domain}`
}

const AVATAR_HUES = [152, 200, 265, 330, 28, 48]
export function Avatar({ name = '?', size = 36 }) {
    const hue = AVATAR_HUES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_HUES.length]
    return (
        <span className="account-avatar" style={{ '--avatar-size': `${size}px`, '--avatar-hue': hue }} aria-hidden="true">
            {name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'}
        </span>
    )
}

// Closes a popover on outside pointer or Escape, and returns focus to the trigger.
function useDismiss(open, setOpen, rootRef, triggerRef) {
    useEffect(() => {
        if (!open) return undefined
        const onPointer = (event) => !rootRef.current?.contains(event.target) && setOpen(false)
        const onKey = (event) => {
            if (event.key !== 'Escape') return
            setOpen(false)
            triggerRef.current?.focus()
        }
        document.addEventListener('pointerdown', onPointer)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onPointer)
            document.removeEventListener('keydown', onKey)
        }
    }, [open, setOpen, rootRef, triggerRef])
}

// Forms ------------------------------------------------------------------------------------------

export function PasswordField({ label, value, onChange, autoComplete, hint, id }) {
    const [visible, setVisible] = useState(false)
    const hintId = `${id}-hint`
    return (
        <label className="field field--wide" htmlFor={id}>
            {label}
            <span className="account-password">
                <input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    autoComplete={autoComplete}
                    aria-describedby={hint ? hintId : undefined}
                    maxLength={72}
                    required
                />
                <button type="button" className="account-password__toggle" onClick={() => setVisible((v) => !v)} aria-label={visible ? t('account.form.hidePassword') : t('account.form.showPassword')}>
                    {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
            </span>
            {hint && <span id={hintId} className="account-hint">{hint}</span>}
        </label>
    )
}

function useSubmit(action) {
    const [state, setState] = useState({ busy: false, error: '' })
    const run = async (event) => {
        event?.preventDefault()
        if (state.busy) return
        setState({ busy: true, error: '' })
        try {
            await action()
            setState({ busy: false, error: '' })
        } catch (error) {
            setState({ busy: false, error: errorMessage(error) })
        }
    }
    return [state, run]
}

export function LoginForm({ onSwitch, onDone }) {
    const { signedIn } = useAuth()
    const { showToast } = useWallet()
    const id = useId()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [state, submit] = useSubmit(async () => {
        const me = await accountApi.login({ email, password })
        signedIn(me)
        showToast('win', t('account.signIn'), `@${me.profile.username}`)
        onDone?.()
    })
    return (
        <form className="account-form" onSubmit={submit} noValidate>
            <label className="field field--wide" htmlFor={`${id}-email`}>
                {t('account.form.email')}
                <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
            </label>
            <PasswordField id={`${id}-password`} label={t('account.form.password')} value={password} onChange={setPassword} autoComplete="current-password" />
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <button type="submit" className="button button--primary account-form__submit" disabled={state.busy}>{state.busy ? t('account.form.working') : t('account.form.submitLogin')}</button>
            <div className="account-form__links">
                <button type="button" className="link-button" onClick={() => onSwitch('recover')}>{t('account.form.forgot')}</button>
                <span>{t('account.form.noAccount')} <button type="button" className="link-button" onClick={() => onSwitch('signup')}>{t('account.signUp')}</button></span>
            </div>
        </form>
    )
}

export function SignupForm({ onSwitch, onDone }) {
    const { refresh } = useAuth()
    const id = useId()
    const [form, setForm] = useState({ username: '', fullName: '', email: '', password: '', passwordConfirm: '', acceptTerms: false, acceptPrivacy: false })
    const [sentTo, setSentTo] = useState('')
    const [resent, setResent] = useState('')
    const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }))
    const [state, submit] = useSubmit(async () => {
        if (form.password !== form.passwordConfirm) throw { code: 'password_mismatch' }
        const result = await accountApi.signup(form)
        if (result.status === 'signed_in') {
            await refresh()
            onDone?.()
        } else {
            setSentTo(form.email)
        }
    })
    const [resendState, resend] = useSubmit(async () => {
        await accountApi.resend(sentTo)
        setResent(t('account.recover.sent'))
    })

    if (sentTo) {
        return (
            <div className="account-form account-form--done" role="status">
                <h3>{t('account.signup.checkEmailTitle')}</h3>
                <p>{t('account.signup.checkEmailBody', { email: sentTo })}</p>
                {resent && <p className="muted">{resent}</p>}
                {resendState.error && <p className="form-error" role="alert">{resendState.error}</p>}
                <button type="button" className="button button--ghost" onClick={resend} disabled={resendState.busy}>{t('account.form.resend')}</button>
                <button type="button" className="link-button" onClick={() => onSwitch('login')}>{t('account.form.backToLogin')}</button>
            </div>
        )
    }
    return (
        <form className="account-form account-form--grid" onSubmit={submit} noValidate>
            <label className="field" htmlFor={`${id}-username`}>
                {t('account.form.username')}
                <input id={`${id}-username`} value={form.username} onChange={(e) => set('username')(e.target.value.toLowerCase())} autoComplete="username" minLength={3} maxLength={20} pattern="[a-z0-9_]{3,20}" aria-describedby={`${id}-username-hint`} required />
                <span id={`${id}-username-hint`} className="account-hint">{t('account.form.usernameHint')}</span>
            </label>
            <label className="field" htmlFor={`${id}-name`}>
                {t('account.form.fullName')}
                <input id={`${id}-name`} value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} autoComplete="name" maxLength={80} required />
            </label>
            <label className="field field--wide" htmlFor={`${id}-email`}>
                {t('account.form.email')}
                <input id={`${id}-email`} type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" maxLength={254} required />
            </label>
            <PasswordField id={`${id}-password`} label={t('account.form.password')} value={form.password} onChange={set('password')} autoComplete="new-password" hint={t('account.form.passwordHint')} />
            <PasswordField id={`${id}-confirm`} label={t('account.form.passwordConfirm')} value={form.passwordConfirm} onChange={set('passwordConfirm')} autoComplete="new-password" />
            <label className="account-check field--wide">
                <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms')(e.target.checked)} required />
                <span>{t('account.form.acceptTerms')} <Link to="/termos" target="_blank">{t('account.form.terms')}</Link>.</span>
            </label>
            <label className="account-check field--wide">
                <input type="checkbox" checked={form.acceptPrivacy} onChange={(e) => set('acceptPrivacy')(e.target.checked)} required />
                <span>{t('account.form.acceptPrivacy')} <Link to="/privacidade" target="_blank">{t('account.form.privacy')}</Link> {t('account.form.acceptPrivacyAfter')}</span>
            </label>
            <p className="account-hint field--wide">{t('account.coinsNote')}</p>
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <button type="submit" className="button button--primary account-form__submit field--wide" disabled={state.busy}>{state.busy ? t('account.form.working') : t('account.form.submitSignup')}</button>
            <div className="account-form__links field--wide">
                <span>{t('account.form.haveAccount')} <button type="button" className="link-button" onClick={() => onSwitch('login')}>{t('account.signIn')}</button></span>
            </div>
        </form>
    )
}

export function RecoverForm({ onSwitch }) {
    const id = useId()
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [state, submit] = useSubmit(async () => {
        await accountApi.recover(email)
        setSent(true)
    })
    return (
        <form className="account-form" onSubmit={submit} noValidate>
            <p className="muted">{t('account.recover.subtitle')}</p>
            <label className="field field--wide" htmlFor={`${id}-email`}>
                {t('account.form.email')}
                <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
            </label>
            {sent && <p className="account-success" role="status">{t('account.recover.sent')}</p>}
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
            <button type="submit" className="button button--primary account-form__submit" disabled={state.busy}>{state.busy ? t('account.form.working') : t('account.form.submitRecover')}</button>
            <div className="account-form__links">
                <button type="button" className="link-button" onClick={() => onSwitch('login')}>{t('account.form.backToLogin')}</button>
            </div>
        </form>
    )
}

export function AuthPanel({ mode, onSwitch, onDone }) {
    const { status } = useAuth()
    if (status === 'disabled') {
        return (
            <div className="account-disabled" role="status">
                <h3>{t('account.disabledTitle')}</h3>
                <p>{t('account.disabledBody')}</p>
            </div>
        )
    }
    if (mode === 'signup') return <SignupForm onSwitch={onSwitch} onDone={onDone} />
    if (mode === 'recover') return <RecoverForm onSwitch={onSwitch} />
    return <LoginForm onSwitch={onSwitch} onDone={onDone} />
}

const MODAL_TITLES = { login: 'account.login.title', signup: 'account.signup.title', recover: 'account.recover.title' }

export function AuthModal() {
    const { authModal, openAuth, closeAuth } = useAuth()
    return (
        <Modal open={Boolean(authModal)} onCancel={closeAuth} footer={null} title={authModal ? t(MODAL_TITLES[authModal]) : ''} destroyOnHidden width={authModal === 'signup' ? 620 : 440} centered>
            {authModal && <AuthPanel mode={authModal} onSwitch={openAuth} onDone={closeAuth} />}
        </Modal>
    )
}

// Header -----------------------------------------------------------------------------------------

const MENU = [
    { to: '/conta', key: 'account', Icon: UserRound },
    { to: '/conta/carteira', key: 'wallet', Icon: Wallet },
    { to: '/conta/adicionar-creditos', key: 'addCredits', Icon: CirclePlus },
    { to: '/conta/historico', key: 'history', Icon: History },
    { to: '/conta/historico?aba=movimentacoes', key: 'transactions', Icon: ArrowLeftRight },
    { to: '/conta/cupons', key: 'coupons', Icon: Ticket },
    { to: '/conta/cashback', key: 'cashback', Icon: BadgePercent },
    { to: '/favoritos', key: 'favorites', Icon: Star },
    { to: '/minhas-apostas', key: 'myBets', Icon: Receipt },
    { to: '/configuracoes', key: 'settings', Icon: Settings },
    { to: '/ajuda', key: 'support', Icon: LifeBuoy },
    { to: '/conta/seguranca', key: 'security', Icon: ShieldCheck },
]

function ProfileMenu() {
    const { me, isStaff, logout } = useAuth()
    const { mainBalance, promoBalance } = useWallet()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const rootRef = useRef(null)
    const triggerRef = useRef(null)
    const menuId = useId()
    useDismiss(open, setOpen, rootRef, triggerRef)
    const username = me.profile.username
    const close = () => setOpen(false)
    const signOut = async () => {
        close()
        await logout()
        navigate('/')
    }

    return (
        <div className="account-menu" ref={rootRef}>
            <button ref={triggerRef} type="button" className="account-menu__trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-label={t('account.openProfileMenu', { username })} onClick={() => setOpen((v) => !v)}>
                <Avatar name={username} size={34} />
            </button>
            {open && (
                <div className="account-menu__panel" id={menuId} role="menu" aria-label={t('account.profile')}>
                    <div className="account-menu__head">
                        <Avatar name={username} size={44} />
                        <div>
                            <strong>@{username}</strong>
                            <span>{maskEmail(me.user.email)}</span>
                        </div>
                    </div>
                    <dl className="account-menu__balances">
                        <div><dt>{t('account.mainBalance')}</dt><dd><Coins value={mainBalance} /></dd></div>
                        <div><dt>{t('account.bonusBalance')}</dt><dd><Coins value={promoBalance} /></dd></div>
                    </dl>
                    <ul className="account-menu__list">
                        {MENU.map(({ to, key, Icon }) => (
                            <li key={key} role="none">
                                <Link role="menuitem" to={to} onClick={close}><Icon size={17} aria-hidden="true" />{t(`account.menu.${key}`)}</Link>
                            </li>
                        ))}
                        {isStaff && (
                            <li role="none"><Link role="menuitem" to="/admin" onClick={close}><LayoutDashboard size={17} aria-hidden="true" />{t('account.menu.admin')}</Link></li>
                        )}
                        <li role="none" className="account-menu__sep">
                            <button role="menuitem" type="button" onClick={signOut}><LogOut size={17} aria-hidden="true" />{t('account.menu.signOut')}</button>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    )
}

function BalanceMenu() {
    const { balance, mainBalance, promoBalance } = useWallet()
    const { me } = useAuth()
    const [open, setOpen] = useState(false)
    const rootRef = useRef(null)
    const triggerRef = useRef(null)
    useDismiss(open, setOpen, rootRef, triggerRef)
    const hidden = me?.settings?.hideBalance
    const close = () => setOpen(false)
    return (
        <div className="account-menu" ref={rootRef}>
            <button ref={triggerRef} type="button" className="wallet-menu__button" aria-haspopup="dialog" aria-expanded={open} aria-label={t('wallet.openWallet', { amount: hidden ? '•••' : formatCoins(balance) })} onClick={() => setOpen((v) => !v)}>
                {hidden ? <span className="account-hidden-balance">•••• </span> : <Coins value={balance} />}
            </button>
            {open && (
                <div className="account-menu__panel account-menu__panel--wallet" role="dialog" aria-label={t('account.wallet.title')}>
                    <dl className="account-menu__balances">
                        <div><dt>{t('account.mainBalance')}</dt><dd><Coins value={mainBalance} size={20} /></dd></div>
                        <div><dt>{t('account.bonusBalance')}</dt><dd><Coins value={promoBalance} size={20} /></dd></div>
                    </dl>
                    <p className="account-hint">{t('account.coinsNote')}</p>
                    <div className="account-menu__actions">
                        <Link className="button button--primary button--small" to="/conta/adicionar-creditos" onClick={close}>{t('account.menu.addCredits')}</Link>
                        <Link className="button button--ghost button--small" to="/conta/carteira" onClick={close}>{t('account.menu.wallet')}</Link>
                        <Link className="button button--ghost button--small" to="/conta/historico" onClick={close}>{t('account.menu.history')}</Link>
                    </div>
                </div>
            )}
        </div>
    )
}

export function HeaderAccount() {
    const { status, openAuth } = useAuth()
    if (status === 'loading') return <span className="account-skeleton" role="status" aria-label={t('account.loading')} />
    if (status !== 'authenticated') {
        return (
            <div className="account-actions">
                <button type="button" className="button button--ghost button--small" onClick={() => openAuth('login')}>{t('account.signIn')}</button>
                <button type="button" className="button button--primary button--small" onClick={() => openAuth('signup')}>{t('account.signUp')}</button>
            </div>
        )
    }
    return (
        <div className="account-actions">
            <BalanceMenu />
            <ProfileMenu />
        </div>
    )
}

export function SessionExpiredNotice() {
    const { sessionExpired, dismissSessionExpired, openAuth } = useAuth()
    if (!sessionExpired) return null
    return (
        <p className="notice-bar account-expired" role="alert">
            <span>{t('account.sessionExpired')}</span>
            <button type="button" className="button button--primary button--small" onClick={() => { dismissSessionExpired(); openAuth('login') }}>{t('account.signIn')}</button>
        </p>
    )
}

// Pages ------------------------------------------------------------------------------------------

export function RequireAuth({ children }) {
    const { status, openAuth } = useAuth()
    if (status === 'loading') return <div className="page-skeleton" role="status" aria-label={t('common.loading')}><span className="skeleton skeleton--line" /></div>
    if (status === 'authenticated') return children
    return (
        <div className="state-panel">
            <UserRound size={28} aria-hidden="true" />
            <h1>{status === 'disabled' ? t('account.disabledTitle') : t('account.signInRequired')}</h1>
            <p>{status === 'disabled' ? t('account.disabledBody') : t('account.visitorNote')}</p>
            {status !== 'disabled' && (
                <div className="page__actions">
                    <button type="button" className="button button--primary" onClick={() => openAuth('login')}>{t('account.signIn')}</button>
                    <button type="button" className="button button--ghost" onClick={() => openAuth('signup')}>{t('account.signUp')}</button>
                </div>
            )}
        </div>
    )
}

export { useSubmit }
