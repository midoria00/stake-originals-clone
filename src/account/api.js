// Browser client of the account API (/api/app). The session is in httpOnly cookies the page cannot
// read; every write sends X-Requested-With so the server can reject cross-site requests.
// Amounts come back as integer cents of 123 Coins; the UI shows coins (cents / 100).
import { t, hasKey } from '../i18n'

export class AccountError extends Error {
    constructor(status, code, data = {}) {
        super(code)
        this.status = status
        this.code = code
        this.data = data
    }
}

let onUnauthenticated = null
export const setUnauthenticatedHandler = (handler) => { onUnauthenticated = handler }

export async function api(method, path, body) {
    let response
    try {
        response = await fetch(`/api/app/${path}`, {
            method,
            credentials: 'same-origin',
            headers: { 'x-requested-with': '123bet', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
    } catch {
        throw new AccountError(0, 'network')
    }
    let data = null
    try { data = await response.json() } catch { data = null }
    if (!response.ok) {
        const error = new AccountError(response.status, data?.error ?? 'generic', data ?? {})
        if (response.status === 401 && data?.error === 'unauthenticated') onUnauthenticated?.()
        throw error
    }
    return data
}

const get = (path) => api('GET', path)
const post = (path, body = {}) => api('POST', path, body)
const query = (params) => {
    const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
    return search.size ? `?${search}` : ''
}

export const newKey = (prefix = 'op') => `${prefix}-${crypto.randomUUID()}`
export const centsToCoins = (cents) => (Number(cents) || 0) / 100
export const coinsInput = (coins) => (Math.round(Number(coins) * 100) / 100).toFixed(2)

export function errorMessage(error) {
    const code = error?.code ?? 'generic'
    const key = `account.errors.${code}`
    if (code === 'rate_limited' && error?.data?.retryAfter) return t('account.errors.rate_limited_wait', { seconds: error.data.retryAfter })
    return hasKey(key) ? t(key) : t('account.errors.generic')
}

export const accountApi = {
    config: () => get('auth/config'),
    me: () => get('me'),
    signup: (body) => post('auth/signup', body),
    login: (body) => post('auth/login', body),
    logout: () => post('auth/logout'),
    logoutAll: () => post('auth/logout-all'),
    recover: (email) => post('auth/recover', { email }),
    resend: (email) => post('auth/resend', { email }),
    confirm: (body) => post('auth/confirm', body),
    reset: (body) => post('auth/reset', body),
    changePassword: (body) => post('auth/password', body),
    updateProfile: (fullName) => api('PATCH', 'account/profile', { fullName }),
    updateSettings: (settings) => api('PATCH', 'account/settings', settings),
    deleteAccount: (body) => post('account/delete', body),
    wallet: () => get('wallet'),
    freeCredits: (amount) => post('wallet/free-credits', { amount: coinsInput(amount), idempotencyKey: newKey('free') }),
    transactions: (params = {}) => get(`wallet/transactions${query(params)}`),
    rounds: (params = {}) => get(`history/rounds${query(params)}`),
    sportsBets: (params = {}) => get(`history/sports${query(params)}`),
    promotions: () => get('promotions'),
    redeemCoupon: (code) => post('promotions/coupon', { code }),
    claimCashback: () => post('promotions/cashback'),
    payments: () => get('payments'),
    payment: (id) => get(`payments/detail${query({ id })}`),
    createPayment: (method, amount) => post('payments', { method, amount, idempotencyKey: newKey('pay') }),
    simulatePayment: (id, action) => post('payments/simulate', { id, action }),
    withdrawals: () => get('withdrawals'),
}

// Game rounds decided on the server. Each call returns { round, wallet, ... }; pass `wallet` to
// useWallet().syncWallet(). Stakes are coin amounts (number or "12,50").
export const gameApi = {
    dice: ({ stake, target, direction }) => post('games/dice', { stake: coinsInput(stake), target, direction, idempotencyKey: newKey('dice') }),
    limbo: ({ stake, target }) => post('games/limbo', { stake: coinsInput(stake), target, idempotencyKey: newKey('limbo') }),
    plinko: ({ stake, rows, risk }) => post('games/plinko', { stake: coinsInput(stake), rows, risk, idempotencyKey: newKey('plinko') }),
    mines: {
        current: () => get('games/mines/current'),
        start: ({ stake, mines }) => post('games/mines/start', { stake: coinsInput(stake), mines, idempotencyKey: newKey('mines') }),
        reveal: (roundId, tile) => post('games/mines/reveal', { roundId, tile }),
        cashout: (roundId) => post('games/mines/cashout', { roundId }),
    },
    crash: {
        current: () => get('games/crash/current'),
        start: ({ stake, autoCashout }) => post('games/crash/start', { stake: coinsInput(stake), autoCashout: autoCashout || null, idempotencyKey: newKey('crash') }),
        cashout: (roundId, multiplier) => post('games/crash/cashout', { roundId, multiplier }),
        watch: (roundId) => post('games/crash/watch', { roundId }),
    },
    dino: {
        current: () => get('games/dino/current'),
        start: ({ stake, difficulty }) => post('games/dino/start', { stake: coinsInput(stake), difficulty, idempotencyKey: newKey('dino') }),
        // step: the round step the screen knows; a retry with the same step never rolls twice.
        jump: (roundId, step) => post('games/dino/jump', { roundId, step }),
        cashout: (roundId) => post('games/dino/cashout', { roundId }),
    },
}

export const adminApi = {
    overview: () => get('admin/overview'),
    users: (q, offset = 0) => get(`admin/users${query({ q, offset })}`),
    user: (id) => get(`admin/user${query({ id })}`),
    transactions: (params = {}) => get(`admin/transactions${query(params)}`),
    paymentEvents: (offset = 0) => get(`admin/payment-events${query({ offset })}`),
    errors: (offset = 0) => get(`admin/errors${query({ offset })}`),
    audit: (offset = 0) => get(`admin/audit${query({ offset })}`),
    coupons: () => get('admin/coupons'),
    saveCoupon: (body) => post('admin/coupons', body),
    adjust: (body) => post('admin/adjust', { ...body, idempotencyKey: newKey('adjust') }),
    withdrawals: () => get('admin/withdrawals'),
    createWithdrawal: (body) => post('admin/withdrawals', body),
    transitionWithdrawal: (body) => post('admin/withdrawals/transition', body),
    reconcile: () => post('admin/reconcile'),
    catalog: () => get('admin/catalog'),
}
