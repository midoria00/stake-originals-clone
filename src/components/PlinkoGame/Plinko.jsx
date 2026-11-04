// Plinko Component - Integrated with main layout
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import PlinkoEngine from './PlinkoEngine';
import { getBinColors, BIN_PAYOUTS } from './constants';
import { loadOutcomes } from './outcomes';
import { t } from '../../i18n';
import './Plinko.css';

function BinsRow({ rowCount, riskLevel, winRecords, binsWidthPercentage }) {
    const binsRef = useRef([]);
    const [highlightedBin, setHighlightedBin] = useState(null);

    const binColors = useMemo(() => getBinColors(rowCount), [rowCount]);
    const payouts = BIN_PAYOUTS[rowCount][riskLevel];

    // Play animation when new win record
    useEffect(() => {
        if (winRecords.length > 0) {
            const lastWin = winRecords[winRecords.length - 1];
            const binIndex = lastWin.binIndex;
            setHighlightedBin(binIndex);

            const binEl = binsRef.current[binIndex];
            if (binEl) {
                binEl.animate(
                    [
                        { transform: 'translateY(0)' },
                        { transform: 'translateY(30%)' },
                        { transform: 'translateY(0)' },
                    ],
                    {
                        duration: 300,
                        easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)',
                    }
                );
            }

            const timer = setTimeout(() => setHighlightedBin(null), 500);
            return () => clearTimeout(timer);
        }
    }, [winRecords]);

    // Use pure CSS percentage relative to .plinko-board-wrapper
    const binsWidth = `${(binsWidthPercentage || 0.85) * 100}%`;

    return (
        <div
            className="bins-row"
            style={{ width: binsWidth }}
        >
            {payouts.map((payout, binIndex) => (
                <div
                    key={binIndex}
                    ref={el => binsRef.current[binIndex] = el}
                    className={`bin ${highlightedBin === binIndex ? 'highlight' : ''}`}
                    style={{
                        backgroundColor: binColors.background[binIndex],
                        '--shadow-color': binColors.shadow[binIndex],
                    }}
                >
                    {payout}{payout < 100 ? '×' : ''}
                </div>
            ))}
        </div>
    );
}

function LastWins({ winRecords, winCount = 4 }) {
    const lastWins = winRecords.slice(-winCount).reverse();

    if (lastWins.length === 0) return null;

    return (
        <div className="last-wins" style={{ '--win-count': winCount }}>
            {lastWins.map((win, i) => {
                const binColors = getBinColors(win.rowCount);
                return (
                    <div
                        key={win.id || i}
                        className="last-win-item"
                        style={{ backgroundColor: binColors.background[win.binIndex] }}
                    >
                        {win.payout.multiplier}{win.payout.multiplier < 100 ? '×' : ''}
                    </div>
                );
            })}
        </div>
    );
}

function Plinko({
    rowCount,
    riskLevel,
    betAmount,
    winRecords,
    onBallEnterBin,
    onBalanceChange,
    engineRef
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [plinkoEngine, setPlinkoEngine] = useState(null);
    const [binsWidthPercentage, setBinsWidthPercentage] = useState(0.85);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    const { WIDTH, HEIGHT } = PlinkoEngine;

    // Initialize engine
    useEffect(() => {
        let cancelled = false;
        let engine;

        loadOutcomes(rowCount).then((bins) => {
            if (cancelled || !canvasRef.current) return;

            engine = new PlinkoEngine(canvasRef.current, {
                rowCount,
                riskLevel,
                betAmount,
                outcomes: { [rowCount]: bins },
                onBallEnterBin: (data) => {
                    onBallEnterBin?.(data);
                },
                onBalanceChange: (amount) => {
                    onBalanceChange?.(amount);
                },
            });

            engine.start();
            setPlinkoEngine(engine);
            setBinsWidthPercentage(engine.binsWidthPercentage);
            setIsLoading(false);

            if (engineRef) engineRef.current = engine;
        }).catch(() => {
            if (cancelled) return;
            setLoadFailed(true);
            setIsLoading(false);
        });

        return () => {
            cancelled = true;
            engine?.stop();
            if (engineRef) engineRef.current = null;
        };
    }, []);

    // Update row count: fetch that row's drop positions first, so no ball drops on a board without them.
    useEffect(() => {
        if (!plinkoEngine || plinkoEngine.rowCount === rowCount) return;
        let cancelled = false;
        loadOutcomes(rowCount).then((bins) => {
            if (cancelled) return;
            plinkoEngine.outcomes[rowCount] = bins;
            plinkoEngine.updateRowCount(rowCount);
            setBinsWidthPercentage(plinkoEngine.binsWidthPercentage);
        }).catch(() => {
            if (!cancelled) setLoadFailed(true);
        });
        return () => { cancelled = true; };
    }, [rowCount, plinkoEngine]);

    // Update risk level
    useEffect(() => {
        if (plinkoEngine) {
            plinkoEngine.updateRiskLevel(riskLevel);
        }
    }, [riskLevel, plinkoEngine]);

    // Update bet amount
    useEffect(() => {
        if (plinkoEngine) {
            plinkoEngine.updateBetAmount(betAmount);
        }
    }, [betAmount, plinkoEngine]);

    return (
        <div className="plinko" ref={containerRef}>
            <div className="plinko-content">
                <div className="plinko-board-wrapper">
                    <div className="plinko-canvas-container" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
                        {isLoading && (
                            <div className="plinko-loading" role="status" aria-label={t('plinko.loading')}>
                                <div className="loading-spinner" />
                            </div>
                        )}
                        {loadFailed && (
                            <div className="plinko-loading" role="alert">{t('plinko.loadError')}</div>
                        )}
                        <canvas
                            ref={canvasRef}
                            width={WIDTH}
                            height={HEIGHT}
                            className="plinko-canvas"
                        />
                    </div>
                    <BinsRow
                        rowCount={rowCount}
                        riskLevel={riskLevel}
                        winRecords={winRecords}
                        binsWidthPercentage={binsWidthPercentage}
                    />
                </div>
            </div>
            <LastWins winRecords={winRecords} />
        </div>
    );
}

export default Plinko;
