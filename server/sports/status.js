// Fixture status codes (API-Football short codes; demo mode emits the same ones).
const STATUSES = {
    TBD: ['scheduled', 'A definir'],
    NS: ['scheduled', 'Não iniciado'],
    '1H': ['live', '1º tempo'],
    HT: ['live', 'Intervalo'],
    '2H': ['live', '2º tempo'],
    ET: ['live', 'Prorrogação'],
    BT: ['live', 'Intervalo da prorrogação'],
    P: ['live', 'Pênaltis'],
    SUSP: ['live', 'Suspenso'],
    INT: ['live', 'Interrompido'],
    LIVE: ['live', 'Ao vivo'],
    FT: ['finished', 'Encerrado'],
    AET: ['finished', 'Encerrado na prorrogação'],
    PEN: ['finished', 'Encerrado nos pênaltis'],
    PST: ['cancelled', 'Adiado'],
    CANC: ['cancelled', 'Cancelado'],
    ABD: ['cancelled', 'Abandonado'],
    AWD: ['cancelled', 'Resultado administrativo'],
    WO: ['cancelled', 'W.O.'],
}

export function describeStatus(code, elapsed = null, extra = null) {
    const [phase, label] = STATUSES[code] ?? ['scheduled', code || 'A definir']
    return { code: code || 'TBD', phase, label, elapsed: elapsed ?? null, extra: extra ?? null }
}
