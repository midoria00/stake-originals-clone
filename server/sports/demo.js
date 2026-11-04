// Demo provider: used when no data provider key is configured. Everything it returns is SIMULATED
// (fixtures, scores, statistics and odds) and flagged with `simulated: true`; it is deterministic per
// day, so every visitor sees the same matches and bets settle consistently.
import { describeLeague } from './leagues.js'
import { describeStatus } from './status.js'
import { makeMarket, sortMarkets } from './markets.js'

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000 // Brazil has had no DST since 2019
const DAY_MS = 24 * 60 * 60 * 1000
const MARGIN = 0.06

const DEMO_LEAGUES = [
    { id: 71, teams: ['Flamengo', 'Palmeiras', 'São Paulo', 'Corinthians', 'Santos', 'Grêmio', 'Internacional', 'Atlético-MG', 'Cruzeiro', 'Botafogo', 'Fluminense', 'Vasco da Gama', 'Bahia', 'Fortaleza', 'Athletico-PR', 'Bragantino'] },
    { id: 13, teams: ['River Plate', 'Boca Juniors', 'Racing Club', 'Estudiantes', 'Peñarol', 'Nacional', 'LDU Quito', 'Olimpia'] },
    { id: 2, teams: ['Bayern München', 'Paris Saint-Germain', 'Inter', 'Juventus', 'Borussia Dortmund', 'Benfica', 'Porto', 'PSV'] },
    { id: 39, teams: ['Arsenal', 'Manchester City', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham'] },
    { id: 140, teams: ['Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Sevilla', 'Real Sociedad', 'Villarreal', 'Athletic Club', 'Real Betis', 'Valencia', 'Girona'] },
    { id: 135, teams: ['Milan', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino'] },
]

// ---------- deterministic randomness ----------

function hash(text) {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
}

function seeded(text) {
    let a = hash(text)
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function poissonSample(lambda, random) {
    const limit = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
        k += 1
        p *= random()
    } while (p > limit)
    return k - 1
}

function poissonPmf(lambda, max) {
    const out = [Math.exp(-lambda)]
    for (let k = 1; k <= max; k++) out.push((out[k - 1] * lambda) / k)
    return out
}

function shuffle(list, random) {
    const items = [...list]
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]]
    }
    return items
}

const rating = (team, salt) => 0.8 + (hash(`${salt}:${team}`) % 61) / 100 // 0.80..1.40

// ---------- calendar ----------

export function brtDate(ms) {
    return new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10)
}

function dayStart(date) {
    const [y, m, d] = date.split('-').map(Number)
    return Date.UTC(y, m - 1, d) + BRT_OFFSET_MS
}

// Real-time match clock: 47 min first half, 15 min break, 49 min second half.
function clockAt(kickoff, now) {
    const m = (now - kickoff) / 60000
    if (m < 0) return { code: 'NS', elapsed: null, extra: null, minute: 0 }
    if (m < 47) {
        const e = Math.floor(m) + 1
        return e <= 45 ? { code: '1H', elapsed: e, extra: null, minute: e } : { code: '1H', elapsed: 45, extra: e - 45, minute: 45 }
    }
    if (m < 62) return { code: 'HT', elapsed: 45, extra: null, minute: 45 }
    if (m < 111) {
        const e = 46 + Math.floor(m - 62)
        return e <= 90 ? { code: '2H', elapsed: e, extra: null, minute: e } : { code: '2H', elapsed: 90, extra: e - 90, minute: 90 }
    }
    return { code: 'FT', elapsed: 90, extra: null, minute: 90 }
}

function schedule(date) {
    const random = seeded(`schedule:${date}`)
    const pairs = DEMO_LEAGUES.flatMap((league) => {
        const teams = shuffle(league.teams, seeded(`pairs:${date}:${league.id}`))
        return Array.from({ length: teams.length / 2 }, (_, i) => ({ leagueId: league.id, home: teams[2 * i], away: teams[2 * i + 1] }))
    })
    const step = Math.floor((24 * 60) / pairs.length / 5) * 5
    const offset = Math.floor(random() * 6) * 5
    return shuffle(pairs, random).map((pair, index) => ({
        ...pair,
        id: `d-${date.replaceAll('-', '')}-${index}`,
        kickoff: dayStart(date) + (offset + index * step) * 60000,
    }))
}

// ---------- match script (what will happen) ----------

function script(fixture) {
    const random = seeded(`match:${fixture.id}`)
    const atkH = rating(fixture.home, 'atk')
    const defH = rating(fixture.home, 'def')
    const atkA = rating(fixture.away, 'atk')
    const defA = rating(fixture.away, 'def')
    const lambdaH = (1.35 * atkH) / defA
    const lambdaA = (1.1 * atkA) / defH
    const events = (count, team, type) => Array.from({ length: count }, () => ({ minute: 1 + Math.floor(random() * 90), team, type }))
    const goals = [...events(poissonSample(lambdaH, random), 'home', 'goal'), ...events(poissonSample(lambdaA, random), 'away', 'goal')]
    const corners = [...events(poissonSample(4.4 + atkH, random), 'home', 'corner'), ...events(poissonSample(3.6 + atkA, random), 'away', 'corner')]
    const cards = [
        ...events(poissonSample(1.9, random), 'home', 'yellow'),
        ...events(poissonSample(2.1, random), 'away', 'yellow'),
        ...events(random() < 0.07 ? 1 : 0, 'home', 'red'),
        ...events(random() < 0.08 ? 1 : 0, 'away', 'red'),
    ]
    const count = (list, team) => list.filter((e) => e.team === team).length
    return {
        lambdaH,
        lambdaA,
        lambdaCorners: 8.0 + atkH + atkA,
        lambdaCards: 4.2,
        events: [...goals, ...corners, ...cards].sort((a, b) => a.minute - b.minute),
        possessionHome: Math.max(36, Math.min(64, Math.round(50 + (atkH - atkA) * 25 + (random() - 0.5) * 8))),
        totals: {
            shots: { home: count(goals, 'home') + 6 + poissonSample(5, random), away: count(goals, 'away') + 5 + poissonSample(4, random) },
            onTarget: { home: count(goals, 'home') + poissonSample(2.5, random), away: count(goals, 'away') + poissonSample(2, random) },
            fouls: { home: 8 + poissonSample(4, random), away: 9 + poissonSample(4, random) },
            offsides: { home: poissonSample(1.8, random), away: poissonSample(1.6, random) },
        },
    }
}

// ---------- odds model (Poisson on the remaining time) ----------

const oddFor = (p, push = 0) => Math.min(41, Math.max(1.01, (1 - push) / (p * (1 + MARGIN))))

function scoreMatrix(lambdaH, lambdaA) {
    const ph = poissonPmf(lambdaH, 10)
    const pa = poissonPmf(lambdaA, 10)
    const cells = []
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) cells.push({ i, j, p: ph[i] * pa[j] })
    return cells
}

const sum = (cells, test) => cells.reduce((total, c) => total + (test(c) ? c.p : 0), 0)

function buildMarkets(s, state) {
    const { minute, score, corners, cards, suspended } = state
    const remaining = Math.max(0, (90 - minute) / 90)
    const cells = scoreMatrix(s.lambdaH * remaining, s.lambdaA * remaining)
    const final = (c) => ({ h: score.home + c.i, a: score.away + c.j })
    const markets = []
    const add = (key, line, picks) => {
        // Skip lines that are already decided: they carry no real price (long shots are capped at 41.0).
        if (picks.some((p) => p.p < 0.005 || p.p > 0.995)) return
        markets.push(makeMarket(key, line, picks.map((p) => ({ pick: p.pick, line: p.line ?? null, odd: oddFor(p.p, p.push), suspended })), 'Simulação'))
    }

    add('match_winner', null, [
        { pick: 'home', p: sum(cells, (c) => final(c).h > final(c).a) },
        { pick: 'draw', p: sum(cells, (c) => final(c).h === final(c).a) },
        { pick: 'away', p: sum(cells, (c) => final(c).h < final(c).a) },
    ])
    for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
        const over = sum(cells, (c) => final(c).h + final(c).a > line)
        add('goals_ou', line, [{ pick: 'over', line, p: over }, { pick: 'under', line, p: 1 - over }])
    }
    const btts = sum(cells, (c) => final(c).h > 0 && final(c).a > 0)
    add('btts', null, [{ pick: 'yes', p: btts }, { pick: 'no', p: 1 - btts }])
    for (const line of [-1.5, -1, -0.5, 0, 0.5, 1]) {
        const win = sum(cells, (c) => final(c).h - final(c).a + line > 0)
        const push = sum(cells, (c) => final(c).h - final(c).a + line === 0)
        add('asian_handicap', line, [
            { pick: 'home', line, p: win, push },
            { pick: 'away', line: -line, p: 1 - win - push, push },
        ])
    }
    for (const line of [-1, 1]) {
        const margin = (c) => final(c).h + line - final(c).a
        add('handicap_3way', line, [
            { pick: 'home', line, p: sum(cells, (c) => margin(c) > 0) },
            { pick: 'draw', line, p: sum(cells, (c) => margin(c) === 0) },
            { pick: 'away', line, p: sum(cells, (c) => margin(c) < 0) },
        ])
    }
    const totalsMarket = (key, lambda, sofar, lines) => {
        const pmf = poissonPmf(lambda * remaining, 30)
        for (const line of lines) {
            const over = pmf.reduce((total, p, k) => total + (sofar + k > line ? p : 0), 0)
            add(key, line, [{ pick: 'over', line, p: over }, { pick: 'under', line, p: 1 - over }])
        }
    }
    totalsMarket('corners_ou', s.lambdaCorners, corners, [7.5, 8.5, 9.5, 10.5, 11.5])
    totalsMarket('cards_ou', s.lambdaCards, cards, [2.5, 3.5, 4.5, 5.5])
    return sortMarkets(markets)
}

// ---------- normalized match ----------

const LEAGUE_ROUND = 'Rodada simulada'

function buildMatch(fixture, now, detail) {
    const s = script(fixture)
    const clock = clockAt(fixture.kickoff, now)
    const status = describeStatus(clock.code, clock.elapsed, clock.extra)
    const started = status.phase !== 'scheduled'
    const happened = s.events.filter((e) => started && e.minute <= clock.minute)
    const count = (type, team, list = happened) => list.filter((e) => e.type === type && e.team === team).length
    const goalsAt = (minute) => ({
        home: s.events.filter((e) => e.type === 'goal' && e.team === 'home' && e.minute <= minute).length,
        away: s.events.filter((e) => e.type === 'goal' && e.team === 'away' && e.minute <= minute).length,
    })
    const score = started ? goalsAt(clock.minute) : { home: null, away: null }
    const finished = status.phase === 'finished'
    const cornersBy = { home: count('corner', 'home'), away: count('corner', 'away') }
    const cardsBy = { home: count('yellow', 'home') + count('red', 'home'), away: count('yellow', 'away') + count('red', 'away') }
    const recent = happened.some((e) => (e.type === 'goal' || e.type === 'red') && clock.minute - e.minute < 1)

    const markets = finished
        ? []
        : buildMarkets(s, {
            minute: started ? clock.minute : 0,
            score: started ? score : { home: 0, away: 0 },
            corners: cornersBy.home + cornersBy.away,
            cards: cardsBy.home + cardsBy.away,
            suspended: status.phase === 'live' && recent,
        })

    const match = {
        id: fixture.id,
        simulated: true,
        league: describeLeague(fixture.leagueId, { round: LEAGUE_ROUND }),
        kickoff: new Date(fixture.kickoff).toISOString(),
        status,
        home: { id: `t${hash(fixture.home)}`, name: fixture.home, logo: null },
        away: { id: `t${hash(fixture.away)}`, name: fixture.away, logo: null },
        score: {
            home: score.home,
            away: score.away,
            ht: clock.minute >= 45 && clock.code !== '1H' ? goalsAt(45) : null,
            ft: finished ? score : null,
        },
        totals: started ? { corners: cornersBy, cards: cardsBy } : null,
        odds: { main: markets.find((m) => m.key === 'match_winner') ?? null, live: status.phase === 'live', source: 'Simulação' },
    }
    if (!detail) return match

    const share = started ? clock.minute / 90 : 0
    const scaled = (value, floor) => Math.max(floor, Math.round(value * share))
    return {
        ...match,
        venue: null,
        referee: null,
        markets,
        stats: started
            ? [
                { key: 'possession', label: 'Posse de bola', home: s.possessionHome, away: 100 - s.possessionHome, unit: '%' },
                { key: 'shots', label: 'Finalizações', home: scaled(s.totals.shots.home, score.home), away: scaled(s.totals.shots.away, score.away) },
                { key: 'shotsOnTarget', label: 'Finalizações no alvo', home: scaled(s.totals.onTarget.home, score.home), away: scaled(s.totals.onTarget.away, score.away) },
                { key: 'corners', label: 'Escanteios', ...cornersBy },
                { key: 'yellow', label: 'Cartões amarelos', home: count('yellow', 'home'), away: count('yellow', 'away') },
                { key: 'red', label: 'Cartões vermelhos', home: count('red', 'home'), away: count('red', 'away') },
                { key: 'fouls', label: 'Faltas', home: scaled(s.totals.fouls.home, 0), away: scaled(s.totals.fouls.away, 0) },
                { key: 'offsides', label: 'Impedimentos', home: scaled(s.totals.offsides.home, 0), away: scaled(s.totals.offsides.away, 0) },
            ]
            : [],
        events: happened
            .filter((e) => e.type !== 'corner')
            .map((e) => ({ minute: e.minute, extra: null, team: e.team, type: e.type, player: null, detail: null })),
    }
}

// ---------- provider ----------

function parseDemoId(id) {
    const match = /^d-(\d{4})(\d{2})(\d{2})-(\d{1,3})$/.exec(String(id))
    return match ? { date: `${match[1]}-${match[2]}-${match[3]}`, index: Number(match[4]) } : null
}

export function createDemoProvider({ now = Date.now } = {}) {
    const day = (date, t, detail = false) => schedule(date).map((fixture) => buildMatch(fixture, t, detail))
    const find = (id, t, detail) => {
        const parsed = parseDemoId(id)
        const fixture = parsed && schedule(parsed.date)[parsed.index]
        return fixture ? buildMatch(fixture, t, detail) : null
    }

    return {
        mode: 'demo',
        source: 'Simulação (dados fictícios)',
        quotaLow: () => false,
        async live() {
            const t = now()
            return [brtDate(t - DAY_MS), brtDate(t)].flatMap((date) => day(date, t)).filter((m) => m.status.phase === 'live')
        },
        async byDate(date) {
            return day(date, now())
        },
        async byIds(ids) {
            const t = now()
            return ids.map((id) => find(id, t, false)).filter(Boolean)
        },
        async match(id) {
            return find(id, now(), true)
        },
    }
}
