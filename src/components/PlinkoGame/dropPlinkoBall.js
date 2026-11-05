import { MAX_ACTIVE_BALLS } from './constants';

export async function dropPlinkoBall({
    engine,
    pendingDrops,
    provablyFair,
    rowCount,
    betAmount,
    currentBall,
    selectedBallType,
    placeBet,
    // Server mode: serverPlay() settles the round on the server and resolves to its binIndex; no local fairness or charge.
    serverPlay,
    isCancelled = () => false,
}) {
    if (!engine || engine.getActiveBallCount() + pendingDrops.current >= MAX_ACTIVE_BALLS) return 'busy';

    pendingDrops.current++;
    try {
        if (serverPlay) {
            if (isCancelled()) return 'cancelled'
            let binIndex
            try {
                binIndex = await serverPlay()
            } catch (error) {
                // The caller shows the message; Auto Bet stops on both outcomes.
                return error?.code === 'insufficient_funds' ? 'insufficient-funds' : 'error'
            }
            // The round is already settled server-side, so the ball is dropped even if Auto Bet was stopped meanwhile.
            engine.updateBallStyle(currentBall.color, currentBall.image);
            return engine.dropBall(binIndex, selectedBallType) ? 'dropped' : 'busy';
        }
        const fairnessResult = await provablyFair.generatePlinkoPath(rowCount);
        if (isCancelled()) return 'cancelled';
        if (engine.getActiveBallCount() >= MAX_ACTIVE_BALLS) return 'busy';
        if (!placeBet(betAmount)) return 'insufficient-funds';

        engine.updateBallStyle(currentBall.color, currentBall.image);
        const binIndex = fairnessResult.path.reduce((sum, direction) => sum + direction, 0);
        return engine.dropBall(binIndex, selectedBallType) ? 'dropped' : 'busy';
    } finally {
        pendingDrops.current--;
    }
}
