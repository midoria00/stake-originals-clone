// pt-BR formatting for numbers, 123 Coins, dates and times. Odds keep the decimal-odds convention (1.85).
import { getLocale } from './index.js'

const cache = new Map()
const formatter = (kind, options) => {
    const key = `${getLocale()}|${kind}`
    if (!cache.has(key)) cache.set(key, kind.startsWith('date') ? new Intl.DateTimeFormat(getLocale(), options) : new Intl.NumberFormat(getLocale(), options))
    return cache.get(key)
}

export const formatCoins = (value) => formatter('coins', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)

export const formatNumber = (value, digits = 0) => formatter(`number${digits}`, { maximumFractionDigits: digits }).format(Number(value) || 0)

export const formatPercent = (value, digits = 1) => formatter(`percent${digits}`, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0)

export const formatOdd = (value) => Number(value).toFixed(2)

export const formatMultiplier = (value) => `${Number(value).toFixed(2)}×`

// A live multiplier cut to 0.01×, the precision the server pays (Crash claims and its clock are
// floored). Rounding would show 1.15× at 1.146× while the cash out pays 1.14×. The epsilon keeps
// exact two-decimal values (8.18 is 817.999… × 0.01 in binary) from dropping a cent.
export const truncateMultiplier = (value) => Math.floor(Number(value) * 100 + 1e-9) / 100

export const formatTime = (date) => formatter('dateTime', { hour: '2-digit', minute: '2-digit' }).format(new Date(date))

export const formatDate = (date) => formatter('dateDay', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date))

export const formatDateTime = (date) => formatter('dateFull', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(date))

export const formatWeekdayDateTime = (date) => formatter('dateWeek', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
