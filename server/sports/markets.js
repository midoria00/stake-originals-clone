// Normalized betting markets shared by both providers.
// Selection `line` is relative to the picked side for Asian handicap (home -0.5 / away +0.5)
// and is the HOME handicap for every pick of the 3-way handicap.
export const MARKET_LABELS = {
    match_winner: 'Resultado final',
    goals_ou: 'Total de gols',
    btts: 'Ambas marcam',
    asian_handicap: 'Handicap asiático',
    handicap_3way: 'Handicap (3 vias)',
    corners_ou: 'Escanteios (total)',
    cards_ou: 'Cartões (total)',
}

const ORDER = Object.keys(MARKET_LABELS)
const MAX_LINES = { goals_ou: 8, asian_handicap: 7, handicap_3way: 4, corners_ou: 5, cards_ou: 5 }

export function selectionId(key, pick, line) {
    return `${key}|${pick}|${line ?? ''}`
}

export function makeMarket(key, line, selections, source = null) {
    return {
        key,
        label: MARKET_LABELS[key],
        line: line ?? null,
        source,
        selections: selections.map((s) => ({
            id: selectionId(key, s.pick, s.line ?? null),
            pick: s.pick,
            line: s.line ?? null,
            odd: Math.round(s.odd * 100) / 100,
            suspended: Boolean(s.suspended),
        })),
    }
}

export function sortMarkets(markets) {
    return [...markets].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key) || (a.line ?? 0) - (b.line ?? 0))
}

// Keep the most balanced lines (the ones a bookmaker would headline), then show them in line order.
function pruneLines(markets, key) {
    const limit = MAX_LINES[key]
    if (!limit || markets.length <= limit) return markets
    const spread = (m) => Math.max(...m.selections.map((s) => s.odd)) - Math.min(...m.selections.map((s) => s.odd))
    return [...markets].sort((a, b) => spread(a) - spread(b)).slice(0, limit)
}

// ---------- API-Football bets -> markets ----------

const FAMILIES = [
    ['match_winner', /^(match winner|full ?time result|1x2)$/i],
    ['goals_ou', /^(goals over\s*\/?\s*under|over\s*\/\s*under line|over\s*\/\s*under|total goals|match goals)$/i],
    ['btts', /^both teams (to )?score$/i],
    ['asian_handicap', /^asian handicap$/i],
    ['handicap_3way', /^(handicap result|european handicap|3[- ]way handicap)$/i],
    ['corners_ou', /^(corners over\s*\/?\s*under|total corners)$/i],
    ['cards_ou', /^(cards over\s*\/?\s*under|total cards)$/i],
]

const VALUE_RE = /^(home|away|draw|over|under|yes|no)\b\s*([+-]?\d+(?:\.\d+)?)?\s*$/i

export function familyOf(betName) {
    const name = String(betName ?? '').trim()
    return FAMILIES.find(([, re]) => re.test(name))?.[0] ?? null
}

function parseValue(v) {
    const match = String(v?.value ?? '').trim().match(VALUE_RE)
    if (!match) return null
    const rawLine = match[2] ?? (v.handicap !== undefined && v.handicap !== null && v.handicap !== '' ? String(v.handicap) : null)
    const line = rawLine === null ? null : Number(rawLine)
    const odd = Number(v.odd)
    if (!Number.isFinite(odd) || odd <= 1 || (line !== null && !Number.isFinite(line))) return null
    return { pick: match[1].toLowerCase(), line, odd, suspended: Boolean(v.suspended) }
}

const lineKey = (line) => String(line ?? '')

function groupByLine(values) {
    const groups = new Map()
    for (const v of values) {
        const key = lineKey(v.line)
        if (!groups.has(key)) groups.set(key, { line: v.line, picks: new Map() })
        const group = groups.get(key)
        if (!group.picks.has(v.pick)) group.picks.set(v.pick, v)
    }
    return [...groups.values()]
}

function buildFamily(key, values, source) {
    if (key === 'match_winner' || key === 'btts') {
        const picks = key === 'btts' ? ['yes', 'no'] : ['home', 'draw', 'away']
        const byPick = new Map(values.filter((v) => v.line === null).map((v) => [v.pick, v]))
        return picks.every((p) => byPick.has(p)) ? [makeMarket(key, null, picks.map((p) => byPick.get(p)), source)] : []
    }

    if (key === 'goals_ou' || key === 'corners_ou' || key === 'cards_ou') {
        return pruneLines(groupByLine(values)
            .filter((g) => g.line !== null && g.line >= 0 && g.picks.has('over') && g.picks.has('under'))
            .map((g) => makeMarket(key, g.line, [g.picks.get('over'), g.picks.get('under')], source)), key)
    }

    if (key === 'handicap_3way') {
        return pruneLines(groupByLine(values)
            .filter((g) => Number.isInteger(g.line) && ['home', 'draw', 'away'].every((p) => g.picks.has(p)))
            .map((g) => makeMarket(key, g.line, ['home', 'draw', 'away'].map((p) => ({ ...g.picks.get(p), line: g.line })), source)), key)
    }

    if (key === 'asian_handicap') {
        const home = values.filter((v) => v.pick === 'home' && v.line !== null)
        const away = values.filter((v) => v.pick === 'away' && v.line !== null)
        // Providers write the away number either relative to the home team ("Away -1" = home -1)
        // or to the away team ("Away +1"); pick the convention that pairs more lines.
        const has = (line) => away.some((a) => a.line === line)
        const teamRelative = home.filter((h) => has(-h.line)).length > home.filter((h) => has(h.line)).length
        const markets = []
        for (const h of home) {
            const a = away.find((v) => v.line === (teamRelative ? -h.line : h.line))
            if (!a || markets.some((m) => m.line === h.line)) continue
            markets.push(makeMarket(key, h.line, [{ ...h, line: h.line }, { ...a, line: -h.line }], source))
        }
        return pruneLines(markets, key)
    }
    return []
}

export function normalizeBets(bets, source = null) {
    const byFamily = new Map()
    for (const bet of bets ?? []) {
        const key = familyOf(bet?.name)
        if (!key || byFamily.has(key)) continue
        const values = (bet.values ?? []).map(parseValue).filter(Boolean)
        const markets = buildFamily(key, values, source)
        if (markets.length) byFamily.set(key, markets)
    }
    return sortMarkets([...byFamily.values()].flat())
}

// Each market family comes from the highest-priority bookmaker that offers it.
export function marketsFromBookmakers(bookmakers, priorityIds = []) {
    const rank = (b) => {
        const index = priorityIds.indexOf(Number(b.id))
        return index === -1 ? priorityIds.length : index
    }
    const ranked = [...(bookmakers ?? [])].sort((a, b) => rank(a) - rank(b) || (b.bets?.length ?? 0) - (a.bets?.length ?? 0))
    const families = new Map()
    for (const bookmaker of ranked) {
        const markets = normalizeBets(bookmaker.bets, bookmaker.name)
        for (const key of new Set(markets.map((m) => m.key))) {
            if (!families.has(key)) families.set(key, markets.filter((m) => m.key === key))
        }
    }
    return sortMarkets([...families.values()].flat())
}
