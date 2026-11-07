import { marketLabel } from './format'

// Server bet (GET /api/app/history/sports, amounts in cents, odds in basis points) -> the shape the
// bet list renders for visitors' local bets.
export function fromServerBet(bet) {
    const open = bet.status === 'open'
    return {
        id: bet.id,
        server: true,
        type: bet.kind,
        placedAt: bet.createdAt,
        stake: bet.stake / 100,
        odd: bet.oddsBp / 10000,
        potential: bet.potentialPayout / 100,
        status: open ? 'pending' : bet.status,
        payout: open ? null : bet.payout / 100,
        simulated: bet.dataSource === 'demo',
        legs: bet.selections.map((s) => ({
            matchId: s.matchId,
            matchLabel: s.matchLabel,
            marketLabel: marketLabel({ key: s.market, label: s.market }),
            label: s.selectionLabel,
            odd: s.oddsBp / 10000,
            result: s.status === 'open' ? 'pending' : s.status,
        })),
    }
}
