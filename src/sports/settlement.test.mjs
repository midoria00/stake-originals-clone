import assert from 'node:assert/strict'
import test from 'node:test'
import { legFactor, settleBet, settleLeg } from './settlement.js'

const finished = (home, away, extra = {}) => ({
    status: { code: 'FT' },
    kickoff: '2026-11-04T18:00:00.000Z',
    score: { ft: { home, away } },
    totals: { corners: { home: 6, away: 4 }, cards: { home: 2, away: 3 } },
    ...extra,
})

const leg = (market, pick, line = null) => ({ market, pick, line })

test('match winner, both teams score and goals totals', () => {
    assert.equal(settleLeg(leg('match_winner', 'home'), finished(2, 1)), 'won')
    assert.equal(settleLeg(leg('match_winner', 'draw'), finished(2, 1)), 'lost')
    assert.equal(settleLeg(leg('match_winner', 'draw'), finished(1, 1)), 'won')
    assert.equal(settleLeg(leg('btts', 'yes'), finished(1, 1)), 'won')
    assert.equal(settleLeg(leg('btts', 'yes'), finished(1, 0)), 'lost')
    assert.equal(settleLeg(leg('btts', 'no'), finished(0, 0)), 'won')
    assert.equal(settleLeg(leg('goals_ou', 'over', 2.5), finished(2, 1)), 'won')
    assert.equal(settleLeg(leg('goals_ou', 'under', 2.5), finished(2, 1)), 'lost')
    assert.equal(settleLeg(leg('goals_ou', 'over', 3), finished(2, 1)), 'void')
})

test('quarter lines settle as two half stakes', () => {
    assert.equal(settleLeg(leg('goals_ou', 'over', 2.25), finished(1, 1)), 'half_lost')
    assert.equal(settleLeg(leg('goals_ou', 'over', 2.75), finished(2, 1)), 'half_won')
    assert.equal(settleLeg(leg('goals_ou', 'under', 2.25), finished(1, 1)), 'half_won')
    assert.equal(settleLeg(leg('asian_handicap', 'home', -0.25), finished(1, 1)), 'half_lost')
    assert.equal(settleLeg(leg('asian_handicap', 'away', 0.25), finished(1, 1)), 'half_won')
    assert.equal(settleLeg(leg('asian_handicap', 'home', -0.75), finished(2, 1)), 'half_won')
})

test('Asian handicap lines are relative to the picked side', () => {
    assert.equal(settleLeg(leg('asian_handicap', 'home', -1), finished(2, 1)), 'void')
    assert.equal(settleLeg(leg('asian_handicap', 'home', -1.5), finished(2, 1)), 'lost')
    assert.equal(settleLeg(leg('asian_handicap', 'away', 1.5), finished(2, 1)), 'won')
    assert.equal(settleLeg(leg('asian_handicap', 'away', 0.5), finished(1, 1)), 'won')
})

test('3-way handicap applies the home handicap to every pick', () => {
    assert.equal(settleLeg(leg('handicap_3way', 'draw', -1), finished(2, 1)), 'won')
    assert.equal(settleLeg(leg('handicap_3way', 'home', -1), finished(2, 1)), 'lost')
    assert.equal(settleLeg(leg('handicap_3way', 'away', 1), finished(1, 1)), 'lost')
    assert.equal(settleLeg(leg('handicap_3way', 'home', 1), finished(1, 1)), 'won')
})

test('corners and cards use match totals, refunded only when statistics never arrive', () => {
    assert.equal(settleLeg(leg('corners_ou', 'over', 9.5), finished(0, 0)), 'won')
    assert.equal(settleLeg(leg('cards_ou', 'under', 4.5), finished(0, 0)), 'lost')
    const noStats = finished(0, 0, { totals: null })
    assert.equal(settleLeg(leg('corners_ou', 'over', 9.5), noStats, Date.parse('2026-11-04T21:00:00Z')), 'pending')
    assert.equal(settleLeg(leg('corners_ou', 'over', 9.5), noStats, Date.parse('2026-11-05T03:00:00Z')), 'void')
})

test('regular-time score decides, unfinished stays open, cancelled is void', () => {
    const afterExtraTime = { status: { code: 'AET' }, kickoff: '2026-11-04T18:00:00Z', score: { ft: { home: 1, away: 1 } } }
    assert.equal(settleLeg(leg('match_winner', 'draw'), afterExtraTime), 'won')
    assert.equal(settleLeg(leg('match_winner', 'home'), { status: { code: '2H' }, score: { ft: null } }), 'pending')
    assert.equal(settleLeg(leg('match_winner', 'home'), { status: { code: 'CANC' }, score: {} }), 'void')
    assert.equal(settleLeg(leg('match_winner', 'home'), undefined), 'pending')
})

test('bets pay stake times the product of leg factors', () => {
    assert.equal(legFactor('half_won', 1.9), 1.45)
    const matches = new Map([['a', finished(2, 0)], ['b', finished(1, 1)], ['c', { status: { code: '1H' }, score: { ft: null } }]])
    const bet = (legs, stake = 10) => ({ status: 'pending', stake, legs: legs.map(([matchId, market, pick, line, odd]) => ({ matchId, market, pick, line, odd, result: 'pending' })) })

    const won = settleBet(bet([['a', 'match_winner', 'home', null, 2], ['b', 'goals_ou', 'over', 2, 1.8]]), matches)
    assert.equal(won.status, 'won')
    assert.equal(won.payout, 20)

    const halfWon = settleBet(bet([['b', 'asian_handicap', 'away', 0.25, 1.9]]), matches)
    assert.equal(halfWon.status, 'won')
    assert.equal(halfWon.payout, 14.5)

    const halfLost = settleBet(bet([['b', 'asian_handicap', 'home', -0.25, 1.9]]), matches)
    assert.equal(halfLost.status, 'partial')
    assert.equal(halfLost.payout, 5)

    const lostEarly = settleBet(bet([['a', 'match_winner', 'away', null, 4], ['c', 'match_winner', 'home', null, 2]]), matches)
    assert.equal(lostEarly.status, 'lost')
    assert.equal(lostEarly.payout, 0)

    const open = settleBet(bet([['a', 'match_winner', 'home', null, 2], ['c', 'match_winner', 'home', null, 2]]), matches)
    assert.equal(open.status, 'pending')
    assert.equal(open.legs[0].result, 'won')

    // Already settled bets are never paid twice.
    assert.equal(settleBet(won, matches), won)
})
