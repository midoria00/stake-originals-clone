// Input validation for the account API. Amounts of 123 Coins travel as decimal strings or numbers
// with at most 2 decimals and are converted to integer cents without floating-point arithmetic.
import { ApiError } from './http.js'

export const TERMS_VERSION = '2026-11-04'
export const PRIVACY_VERSION = '2026-11-04'
export const STAKE_MIN_CENTS = 10
export const STAKE_MAX_CENTS = 1_000_000

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENCY = /^[A-Za-z0-9_:.-]{8,100}$/
const CONTROL = /[\u0000-\u001f\u007f]/

export const fail = (code, status = 400) => { throw new ApiError(status, code) }

export function email(value) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (text.length > 254 || !EMAIL.test(text)) fail('invalid_email')
    return text
}

// Supabase stores a bcrypt hash; bcrypt reads at most 72 bytes.
export function password(value, { email: mail, username: name } = {}) {
    if (typeof value !== 'string' || value.length < 10 || Buffer.byteLength(value) > 72) fail('weak_password')
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) fail('weak_password')
    const lower = value.toLowerCase()
    if ((mail && lower.includes(mail.split('@')[0])) || (name && lower.includes(name))) fail('weak_password')
    return value
}

export function username(value) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (!/^[a-z0-9_]{3,20}$/.test(text)) fail('invalid_username')
    return text
}

export function fullName(value) {
    const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
    if (text.length < 2 || text.length > 80 || CONTROL.test(text) || /[<>]/.test(text)) fail('invalid_full_name')
    return text
}

export function uuid(value, code = 'invalid_id') {
    if (typeof value !== 'string' || !UUID.test(value)) fail(code)
    return value.toLowerCase()
}

export function idempotencyKey(value) {
    if (typeof value !== 'string' || !IDEMPOTENCY.test(value)) fail('invalid_idempotency_key')
    return value
}

export function oneOf(value, allowed, code) {
    if (!allowed.includes(value)) fail(code)
    return value
}

export function int(value, min, max, code) {
    const number = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value
    if (!Number.isInteger(number) || number < min || number > max) fail(code)
    return number
}

// "12,5" / "12.50" / 12.5 -> 1250 cents. Rejects more than 2 decimals, exponents and negatives.
export function coinsToCents(value, code = 'invalid_amount') {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : ''
    const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(text)
    if (!match) fail(code)
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

export function stakeCents(value) {
    const cents = coinsToCents(value, 'invalid_stake')
    if (cents < STAKE_MIN_CENTS || cents > STAKE_MAX_CENTS) fail('invalid_stake')
    return cents
}

// cents x multiplier (in basis points of 1/10,000), rounded half up, in exact integer arithmetic.
export function applyMultiplier(cents, multiplierBp) {
    return Number((BigInt(cents) * BigInt(multiplierBp) + 5000n) / 10000n)
}

export const toBp = (multiplier) => Math.floor(multiplier * 10000 + 1e-7)

export function text(value, { min = 0, max, code }) {
    const result = typeof value === 'string' ? value.trim() : ''
    if (result.length < min || result.length > max || CONTROL.test(result)) fail(code)
    return result
}
