import assert from 'node:assert/strict'
import test from 'node:test'
import { applyEntry, BALANCE_KEY, canAddFreeCredits, canPlace, INITIAL_BALANCE, LEDGER_KEY, LEGACY_BALANCE_KEY, loadWallet, saveWallet } from './ledger.js'

const memoryStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial))
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map }
}

test('new visitors start with 1,000 coins', () => {
    const state = loadWallet(memoryStorage())
    assert.equal(state.balance, INITIAL_BALANCE)
    assert.equal(state.migratedFrom, null)
    assert.deepEqual(state.history, [])
})

test('the previous balance migrates to 123 Coins and the old key is removed only after saving', () => {
    const storage = memoryStorage({ [LEGACY_BALANCE_KEY]: '977.22' })
    const state = loadWallet(storage)
    assert.equal(state.balance, 977.22)
    assert.equal(state.migratedFrom, 977.22)
    assert.equal(state.history[0].type, 'migration')
    assert.equal(storage.map.get(LEGACY_BALANCE_KEY), '977.22', 'nothing deleted while loading')

    // Exactly what WalletProvider does on mount when a migration happened: one full save.
    saveWallet(storage, state)
    assert.equal(storage.map.get(BALANCE_KEY), '977.22')
    assert.equal(storage.map.has(LEGACY_BALANCE_KEY), false)
    const reloaded = loadWallet(storage)
    assert.equal(reloaded.balance, 977.22)
    assert.equal(reloaded.migratedFrom, 977.22, 'the notice can still be shown after a reload')
    assert.equal(reloaded.history.filter((e) => e.type === 'migration').length, 1)
})

test('corrupt or negative stored values fall back safely', () => {
    assert.equal(loadWallet(memoryStorage({ [BALANCE_KEY]: 'abc', [LEDGER_KEY]: '{bad json' })).balance, INITIAL_BALANCE)
    assert.equal(loadWallet(memoryStorage({ [BALANCE_KEY]: '-50' })).balance, 0)
    assert.equal(loadWallet(memoryStorage({ [LEGACY_BALANCE_KEY]: 'NaN' })).balance, INITIAL_BALANCE)
})

test('bets, payouts, free credits and reset keep balance, history and stats consistent', () => {
    let state = loadWallet(memoryStorage())
    state = applyEntry(state, 'bet', 10, 'crash')
    state = applyEntry(state, 'win', 25.5, 'crash')
    state = applyEntry(state, 'bet', 5, 'sports')
    state = applyEntry(state, 'refill', 500, 'wallet')
    assert.equal(state.balance, 1510.5)
    assert.deepEqual(state.stats.bySource.crash, { wagered: 10, returned: 25.5, bets: 1 })
    assert.deepEqual(state.stats.bySource.sports, { wagered: 5, returned: 0, bets: 1 })
    assert.equal(state.stats.wagered, 15)
    assert.equal(state.stats.returned, 25.5)
    assert.equal(state.stats.biggestPayout, 25.5)
    assert.equal(state.stats.freeCredits, 500)
    assert.deepEqual(state.history.map((e) => e.type), ['refill', 'bet', 'win', 'bet'])

    state = applyEntry(state, 'reset', 0, 'wallet')
    assert.equal(state.balance, INITIAL_BALANCE)
    assert.equal(state.history[0].amount, INITIAL_BALANCE)
})

test('stakes must be positive and covered; free credits only in fixed amounts up to the ceiling', () => {
    const state = { ...loadWallet(memoryStorage()), balance: 50 }
    assert.equal(canPlace(state, 50), true)
    assert.equal(canPlace(state, 50.01), false)
    assert.equal(canPlace(state, 0), false)
    assert.equal(canPlace(state, Number.NaN), false)
    assert.equal(canAddFreeCredits(state, 500), true)
    assert.equal(canAddFreeCredits(state, 123), false)
    assert.equal(canAddFreeCredits({ ...state, balance: 99_600 }, 500), false)
})
