// Contract tests for the API-Football odds shapes we rely on (official docs were not readable during
// research; re-check these samples against a real response when a key is available).
import assert from 'node:assert/strict'
import test from 'node:test'
import { familyOf, marketsFromBookmakers, normalizeBets } from './markets.js'

const values = (...pairs) => pairs.map(([value, odd]) => ({ value, odd: String(odd) }))
const summary = (markets) => markets.map((m) => `${m.key}:${m.line ?? ''}=${m.selections.map((s) => `${s.pick}${s.line ?? ''}@${s.odd}`).join(',')}`)

test('pre-match bets map to the supported markets and ignore the rest', () => {
    const markets = normalizeBets([
        { id: 1, name: 'Match Winner', values: values(['Home', 1.8], ['Draw', 3.5], ['Away', 4.2]) },
        { id: 5, name: 'Goals Over/Under', values: values(['Over 2.5', 1.9], ['Under 2.5', 1.9], ['Over 1.5', 1.3], ['Under 1.5', 3.4]) },
        { id: 8, name: 'Both Teams Score', values: values(['Yes', 1.75], ['No', 2.05]) },
        { id: 10, name: 'Exact Score', values: values(['1:0', 7]) },
        { id: 45, name: 'Corners Over Under', values: values(['Over 9.5', 1.85], ['Under 9.5', 1.95]) },
        { id: 80, name: 'Cards Over/Under', values: values(['Over 4.5', 2.1], ['Under 4.5', 1.7]) },
    ], 'Bet365')
    assert.deepEqual(summary(markets), [
        'match_winner:=home@1.8,draw@3.5,away@4.2',
        'goals_ou:1.5=over1.5@1.3,under1.5@3.4',
        'goals_ou:2.5=over2.5@1.9,under2.5@1.9',
        'btts:=yes@1.75,no@2.05',
        'corners_ou:9.5=over9.5@1.85,under9.5@1.95',
        'cards_ou:4.5=over4.5@2.1,under4.5@1.7',
    ])
    assert.ok(markets.every((m) => m.source === 'Bet365'))
    assert.equal(markets[0].selections[0].id, 'match_winner|home|')
})

test('Asian handicap is normalised to team-relative lines under either provider convention', () => {
    const homeRelative = normalizeBets([{ name: 'Asian Handicap', values: values(['Home -1', 2.1], ['Away -1', 1.75], ['Home +0', 1.5], ['Away +0', 2.6]) }])
    const teamRelative = normalizeBets([{ name: 'Asian Handicap', values: values(['Home -1', 2.1], ['Away +1', 1.75], ['Home +0', 1.5], ['Away +0', 2.6]) }])
    const expected = ['asian_handicap:-1=home-1@2.1,away1@1.75', 'asian_handicap:0=home0@1.5,away0@2.6']
    assert.deepEqual(summary(homeRelative), expected)
    assert.deepEqual(summary(teamRelative), expected)
})

test('3-way handicap keeps the home handicap on all picks and skips incomplete lines', () => {
    const markets = normalizeBets([{ name: 'Handicap Result', values: values(['Home -1', 3.1], ['Draw -1', 3.6], ['Away -1', 2.0], ['Home +1', 1.2], ['Draw +1', 6]) }])
    assert.deepEqual(summary(markets), ['handicap_3way:-1=home-1@3.1,draw-1@3.6,away-1@2'])
})

test('in-play shape: value plus handicap field, suspension and blocked flags', () => {
    const markets = normalizeBets([
        { id: 59, name: 'Fulltime Result', values: [{ value: 'Home', odd: '2.10', handicap: null, main: null, suspended: false }, { value: 'Draw', odd: '3.20', suspended: false }, { value: 'Away', odd: '3.60', suspended: true }] },
        { id: 36, name: 'Over/Under Line', values: [{ value: 'Over', odd: '1.80', handicap: '2.5', main: true, suspended: false }, { value: 'Under', odd: '2.00', handicap: '2.5', main: true, suspended: false }] },
        { name: 'Asian Handicap', values: [{ value: 'Home', odd: '1.95', handicap: '-0.25' }, { value: 'Away', odd: '1.90', handicap: '-0.25' }] },
    ])
    assert.deepEqual(summary(markets), [
        'match_winner:=home@2.1,draw@3.2,away@3.6',
        'goals_ou:2.5=over2.5@1.8,under2.5@2',
        'asian_handicap:-0.25=home-0.25@1.95,away0.25@1.9',
    ])
    assert.equal(markets[0].selections[2].suspended, true)
})

test('broken odds never become a market', () => {
    assert.deepEqual(normalizeBets([{ name: 'Match Winner', values: values(['Home', 1.8], ['Draw', 0], ['Away', 4]) }]), [])
    assert.deepEqual(normalizeBets([{ name: 'Goals Over/Under', values: values(['Over 2.5', 1.9]) }]), [])
    assert.equal(familyOf('Goals Over/Under First Half'), null)
    assert.equal(familyOf('Home Team Total Goals'), null)
})

test('each market family comes from the highest-priority bookmaker that has it', () => {
    const markets = marketsFromBookmakers([
        { id: 99, name: 'Other', bets: [{ name: 'Match Winner', values: values(['Home', 1.7], ['Draw', 3.4], ['Away', 5]) }, { name: 'Both Teams Score', values: values(['Yes', 1.8], ['No', 1.95]) }] },
        { id: 8, name: 'Bet365', bets: [{ name: 'Match Winner', values: values(['Home', 1.75], ['Draw', 3.5], ['Away', 4.8]) }] },
    ], [8, 4])
    assert.deepEqual(markets.map((m) => `${m.key}:${m.source}`), ['match_winner:Bet365', 'btts:Other'])
})
