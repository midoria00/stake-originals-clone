// Minimal i18n: one dictionary per locale, split by namespace (src/i18n/pt-BR/*.js).
// t('wallet.balance') or t('pages.casino.count', { count: 3 }). To add English later, create
// src/i18n/en/ with the same namespaces and register it below; missing keys fall back to pt-BR.
import ptBR from './pt-BR/index.js'

const DICTIONARIES = { 'pt-BR': ptBR }
export const DEFAULT_LOCALE = 'pt-BR'
let locale = DEFAULT_LOCALE

export const getLocale = () => locale

export function setLocale(next) {
    if (DICTIONARIES[next]) locale = next
}

function lookup(dictionary, key) {
    let node = dictionary
    for (const part of key.split('.')) {
        if (node == null || typeof node !== 'object') return undefined
        node = node[part]
    }
    return node
}

export function hasKey(key) {
    return typeof lookup(DICTIONARIES[DEFAULT_LOCALE], key) === 'string'
}

const plurals = new Map()

// `count` picks `<key>_one` / `<key>_other` when those exist (Intl plural rules of the locale).
export function t(key, params) {
    let resolvedKey = key
    if (params && typeof params.count === 'number') {
        const rules = plurals.get(locale) ?? plurals.set(locale, new Intl.PluralRules(locale)).get(locale)
        const candidate = `${key}_${rules.select(params.count)}`
        if (typeof lookup(DICTIONARIES[locale], candidate) === 'string' || typeof lookup(ptBR, candidate) === 'string') resolvedKey = candidate
    }
    const value = lookup(DICTIONARIES[locale], resolvedKey) ?? lookup(ptBR, resolvedKey)
    if (typeof value !== 'string') return key
    if (!params) return value
    return value.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match))
}

// Structured entries (FAQ items, rule lists) that pages render in bulk. Same fallback as t().
export function tRaw(key) {
    return lookup(DICTIONARIES[locale], key) ?? lookup(ptBR, key)
}
