import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
    SettingOutlined,
    SafetyCertificateOutlined,
    SoundOutlined,
    TrophyOutlined,
    FireOutlined,
    LineChartOutlined,
    CloseOutlined,
    ReloadOutlined,
    RightOutlined,
    ExpandOutlined,
    FullscreenExitOutlined,
    CheckCircleOutlined,
    BugOutlined
} from '@ant-design/icons'
import { Modal, Tooltip, Statistic, Row, Col, Space, Button, Typography, Tag, Divider, Input, InputNumber } from 'antd'
import Chart from 'chart.js/auto'

const { Title, Text, Paragraph } = Typography;
import { useWallet } from '../../context/WalletContext'
import ProvablyFair from '../../utils/ProvablyFair'
import { Coins, CoinIcon, Logo } from '../../brand/Brand'
import { t } from '../../i18n'
import { formatCoins, formatMultiplier, formatNumber } from '../../i18n/format'
import MobileBetSheet from '../MobileBetSheet'
import './MinesGame.css'

const HOUSE_EDGE = 0.99; // 1% edge

const calculateMultiplier = (mines, hits) => {
    if (hits === 0) return 1.00;
    let mult = 1;
    for (let i = 0; i < hits; i++) {
        mult *= (25 - i) / (25 - mines - i);
    }
    return mult * HOUSE_EDGE;
};

// SVG Icons inline to avoid ant-design missing ones if any
const HistoryIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </svg>
)

const StatsIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11.78l4.24-7.33 1.73 1-5.23 9.05-6.51-3.75L5.46 19H22v2H2V3h2v14.54L9.5 8z" />
    </svg>
)

function MinesGame() {
    const { balance, placeBet, addWinnings, showToast } = useWallet();
    const [isPlaying, setIsPlaying] = useState(false);
    const [betAmount, setBetAmount] = useState(1);
    const [minesCount, setMinesCount] = useState(3);
    const [revealedTiles, setRevealedTiles] = useState([]);
    const [mineLocations, setMineLocations] = useState([]);
    const [gameOverState, setGameOverState] = useState(null) // 'win', 'loss', or null
    const [isHovering, setIsHovering] = useState(null);
    const [fairnessModalOpen, setFairnessModalOpen] = useState(false);

    // Bottom Controls State
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);

    // Debug & Fairness State
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [debugData, setDebugData] = useState(null);

    // Provably Fair
    const fairnessRef = useRef(null);
    const [fairnessData, setFairnessData] = useState({
        serverSeedHash: t('mines.loading'),
        clientSeed: t('mines.loading'),
        nonce: 0,
    });
    const [revealedSeed, setRevealedSeed] = useState(null);
    const [clientSeedInput, setClientSeedInput] = useState('');

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Stats states
    const [statsDrawerOpen, setStatsDrawerOpen] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [winRecords, setWinRecords] = useState([]);
    const [totalProfit, setTotalProfit] = useState(0);
    const [winsCount, setWinsCount] = useState(0);
    const [lossesCount, setLossesCount] = useState(0);
    const [hoveredProfitValue, setHoveredProfitValue] = useState(null);

    // Refs
    const widgetRef = useRef(null);
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const chartCanvasRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const profitHistoryRef = useRef([0]);

    // Debug Widget Refs
    const debugWidgetRef = useRef(null);
    const isDebugDragging = useRef(false);
    const debugDragOffset = useRef({ x: 0, y: 0 });

    // Initialize ProvablyFair
    useEffect(() => {
        const pf = new ProvablyFair();
        fairnessRef.current = pf;
        pf.waitReady().then(async () => {
            const data = await pf.getFairnessData();
            setFairnessData(data);
            setClientSeedInput(data.clientSeed);
        });
    }, []);

    // Fetch peek data for Fairness Debug whenever conditions change
    useEffect(() => {
        const pf = fairnessRef.current;
        // Don't update debug data while game is playing, so it matches the current game.
        if (isDebugMode && pf && pf._hashReady && !isPlaying) {
            pf.peekMinesPositions(minesCount).then(data => {
                setDebugData(data);
            }).catch(err => console.error('Peek info error:', err));
        }
    }, [isDebugMode, fairnessData, minesCount, isPlaying]);

    // Handle client seed change
    const handleChangeClientSeed = useCallback(async () => {
        const pf = fairnessRef.current;
        if (!pf || !clientSeedInput) return;
        await pf.setClientSeed(clientSeedInput);
        const data = await pf.getFairnessData();
        setFairnessData(data);
    }, [clientSeedInput]);

    // Handle seed rotation (reveals current seed)
    const handleRotateSeed = useCallback(async () => {
        const pf = fairnessRef.current;
        if (!pf) return;
        const revealed = await pf.rotateSeed();
        setRevealedSeed(revealed);
        const data = await pf.getFairnessData();
        setFairnessData(data);
        setClientSeedInput(data.clientSeed);
    }, []);

    // Drag handler for debug widget
    const handleDebugDragStart = useCallback((e) => {
        if (!debugWidgetRef.current) return;
        isDebugDragging.current = true;
        const rect = debugWidgetRef.current.getBoundingClientRect();
        debugDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        const handleMouseMove = (moveEvt) => {
            if (!isDebugDragging.current || !debugWidgetRef.current) return;
            const newX = moveEvt.clientX - debugDragOffset.current.x;
            const newY = moveEvt.clientY - debugDragOffset.current.y;

            const maxX = window.innerWidth - debugWidgetRef.current.offsetWidth;
            const maxY = window.innerHeight - debugWidgetRef.current.offsetHeight;
            debugWidgetRef.current.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
            debugWidgetRef.current.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
            debugWidgetRef.current.style.right = 'auto';
            debugWidgetRef.current.style.bottom = 'auto';
            debugWidgetRef.current.style.transform = 'none';
        };

        const handleMouseUp = () => {
            isDebugDragging.current = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    // Live Stats Drag Logic
    const handleDragStart = (e) => {
        if (!widgetRef.current) return;
        isDragging.current = true;
        const rect = widgetRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', handleDragEnd);
    };

    const handleDrag = (e) => {
        if (!isDragging.current || !widgetRef.current) return;
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;

        // Boundaries
        const maxX = window.innerWidth - widgetRef.current.offsetWidth;
        const maxY = window.innerHeight - widgetRef.current.offsetHeight;

        const boundedX = Math.max(0, Math.min(newX, maxX));
        const boundedY = Math.max(0, Math.min(newY, maxY));

        widgetRef.current.style.left = `${boundedX}px`;
        widgetRef.current.style.top = `${boundedY}px`;
        widgetRef.current.style.right = 'auto';
        widgetRef.current.style.bottom = 'auto';
    };

    const handleDragEnd = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
    };

    // Chart Update Logic
    useEffect(() => {
        if (!statsDrawerOpen || !chartCanvasRef.current) return;

        const WIN_COLOR = 'rgb(74, 222, 128)';
        const WIN_COLOR_FILL = 'rgba(74, 222, 128, 0.3)';
        const LOSS_COLOR = 'rgb(248, 113, 113)';
        const LOSS_COLOR_FILL = 'rgba(248, 113, 113, 0.3)';
        const X_AXIS_COLOR = '#2a3f4d';
        const POINT_HOVER_COLOR = '#fff';

        const profitHistory = profitHistoryRef.current.length > 0 ? profitHistoryRef.current : [0];

        if (chartInstanceRef.current) {
            // Update existing chart
            chartInstanceRef.current.data.labels = Array(profitHistory.length).fill(0);
            chartInstanceRef.current.data.datasets[0].data = profitHistory;
            chartInstanceRef.current.update('none'); // Update without animation for smooth flow
        } else {
            // Initialize new chart
            chartInstanceRef.current = new Chart(chartCanvasRef.current, {
                type: 'line',
                data: {
                    labels: Array(profitHistory.length).fill(0),
                    datasets: [
                        {
                            label: t('mines.stats.profit'),
                            data: profitHistory,
                            fill: {
                                target: 'origin',
                                above: WIN_COLOR_FILL,
                                below: LOSS_COLOR_FILL,
                            },
                            cubicInterpolationMode: 'monotone',
                            segment: {
                                borderColor: (ctx) => {
                                    if (!ctx.p0 || !ctx.p1) return WIN_COLOR;
                                    const y0 = ctx.p0.parsed.y;
                                    const y1 = ctx.p1.parsed.y;
                                    if (y1 === 0) {
                                        return y0 < 0 ? LOSS_COLOR : WIN_COLOR;
                                    }
                                    return y1 < 0 ? LOSS_COLOR : WIN_COLOR;
                                },
                            },
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            pointHoverBackgroundColor: POINT_HOVER_COLOR,
                            pointHoverBorderColor: POINT_HOVER_COLOR,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animations: {
                        y: {
                            duration: 0,
                        },
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false },
                    },
                    scales: {
                        x: {
                            border: { display: false },
                            grid: { display: false },
                            ticks: { display: false },
                        },
                        y: {
                            border: { display: false },
                            grid: {
                                color: (ctx) => (ctx.tick.value === 0 ? X_AXIS_COLOR : 'transparent'),
                                lineWidth: 2,
                            },
                            ticks: { display: false },
                            grace: '1%',
                        },
                    },
                    onHover: (_, elements) => {
                        if (elements.length) {
                            const idx = elements[0].index;
                            const val = profitHistoryRef.current[idx];
                            setHoveredProfitValue(val !== undefined ? val : null);
                        } else {
                            setHoveredProfitValue(null);
                        }
                    },
                },
            });
        }
    }, [statsDrawerOpen, winRecords]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, []);

    // Audio setup (mock for now, or use standard web audio)
    const playSound = (type) => {
        // Here we could implement sound effects
        // console.log(`Playing sound: ${type}`)
    }

    const currentMultiplier = useMemo(() => {
        return calculateMultiplier(minesCount, revealedTiles.length);
    }, [minesCount, revealedTiles.length]);

    const potentialWin = useMemo(() => {
        return betAmount * currentMultiplier;
    }, [betAmount, currentMultiplier]);

    const handleBetAmountChange = (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) val = 0;
        setBetAmount(val);
    };

    const handleBetAmountHalf = () => setBetAmount(prev => Math.max(0, prev / 2));
    const handleBetAmountDouble = () => setBetAmount(prev => prev * 2);

    const handleMinesChange = (e) => {
        const count = parseInt(e.target.value, 10);
        if (count >= 1 && count <= 24) {
            setMinesCount(count);
        }
    };

    const startGame = async () => {
        if (betAmount <= 0) return;
        const pf = fairnessRef.current;
        if (!pf) return;

        const result = await pf.generateMinesPositions(minesCount);
        const mines = new Set(result.minePositions);
        const data = await pf.getFairnessData();

        if (!placeBet(betAmount, 'mines')) {
            showToast('error', t('games.insufficientTitle'), t('mines.toast.insufficientBody', { amount: formatCoins(betAmount) }));
            return;
        }

        setFairnessData(data);
        setMineLocations(Array.from(mines));
        setRevealedTiles([]);
        setGameOverState(null);
        setIsPlaying(true);
        showToast('bet', t('mines.toast.startedTitle'), t('mines.toast.startedBody', { amount: formatCoins(betAmount) }));
    };

    const endGame = (reason) => {
        setIsPlaying(false);
        setGameOverState(reason);
        if (reason === 'win') {
            const profit = potentialWin - betAmount;
            addWinnings(potentialWin, 'mines');

            // Update stats
            setTotalProfit(prev => prev + profit);
            setWinsCount(prev => prev + 1);
            setWinRecords(prev => [...prev, profit]);
            profitHistoryRef.current.push(profitHistoryRef.current[profitHistoryRef.current.length - 1] + profit);

            showToast('win', t('mines.toast.cashOutTitle'), t('mines.toast.cashOutBody', { amount: formatCoins(profit), multiplier: formatMultiplier(currentMultiplier) }), 4000);
            playSound('win');
        } else if (reason === 'loss') {
            // Update stats
            setTotalProfit(prev => prev - betAmount);
            setLossesCount(prev => prev + 1);
            setWinRecords(prev => [...prev, -betAmount]);
            profitHistoryRef.current.push(profitHistoryRef.current[profitHistoryRef.current.length - 1] - betAmount);

            showToast('loss', t('mines.toast.lossTitle'), t('mines.toast.lossBody', { amount: formatCoins(betAmount) }), 3000);
            playSound('loss');
        }
    };

    const cashout = () => {
        if (!isPlaying || revealedTiles.length === 0) return;
        endGame('win');
    };

    const pickRandom = () => {
        if (!isPlaying) return;
        const unrevealedSafe = [];
        for (let i = 0; i < 25; i++) {
            if (!revealedTiles.includes(i)) {
                unrevealedSafe.push(i);
            }
        }
        if (unrevealedSafe.length > 0) {
            const randomPick = unrevealedSafe[Math.floor(Math.random() * unrevealedSafe.length)];
            handleTileClick(randomPick);
        }
    };

    const handleTileClick = (index) => {
        if (!isPlaying || revealedTiles.includes(index) || gameOverState) return;

        if (mineLocations.includes(index)) {
            // Hit a mine
            setRevealedTiles(prev => [...prev, index]);
            endGame('loss');
        } else {
            // Hit a gem
            const newRevealed = [...revealedTiles, index];
            setRevealedTiles(newRevealed);
            playSound('gem');

            // Check if user found all gems
            if (newRevealed.length === 25 - minesCount) {
                // Auto win
                setIsPlaying(false);
                setGameOverState('win');
                const finalMult = calculateMultiplier(minesCount, newRevealed.length);
                const finalWin = betAmount * finalMult;
                const profit = finalWin - betAmount;
                addWinnings(finalWin, 'mines');

                // Update stats
                setTotalProfit(prev => prev + profit);
                setWinsCount(prev => prev + 1);
                setWinRecords(prev => [...prev, profit]);
                profitHistoryRef.current.push(profitHistoryRef.current[profitHistoryRef.current.length - 1] + profit);

                showToast('win', t('mines.toast.allGemsTitle'), t('mines.toast.cashOutBody', { amount: formatCoins(profit), multiplier: formatMultiplier(finalMult) }), 4000);
            }
        }
    };

    const renderGrid = () => {
        const tiles = [];
        for (let i = 0; i < 25; i++) {
            const isRevealed = revealedTiles.includes(i);
            const isMine = mineLocations.includes(i);
            const isGameOver = !isPlaying && gameOverState;

            let statusClass = '';
            let content = null;

            if (isRevealed) {
                statusClass = `revealed ${isMine ? 'bomb-tile' : 'gem-tile'}`;
                content = isMine ? (
                    <>
                        <img src="/images/mines/bomb.svg" alt="" className="reveal-anim" />
                        <img src="/images/mines/bomb_effect.gif" alt="" className="bomb-effect" />
                    </>
                ) : (
                    <img src="/images/mines/diamond.svg" alt="" className="reveal-anim" />
                );
            } else if (isGameOver) {
                // Show remaining tiles semi-transparently
                statusClass = `revealed game-over-reveal`;
                content = isMine ? (
                    <img src="/images/mines/bomb.svg" alt="" style={{ filter: 'grayscale(100%) opacity(0.5)' }} />
                ) : (
                    <img src="/images/mines/diamond.svg" alt="" style={{ filter: 'grayscale(100%) opacity(0.5)' }} />
                );
            }

            const tileLabel = isRevealed
                ? t(isMine ? 'mines.tile.mine' : 'mines.tile.gem', { n: i + 1 })
                : isGameOver
                    ? t(isMine ? 'mines.tile.remainingMine' : 'mines.tile.remainingGem', { n: i + 1 })
                    : t('mines.tile.hidden', { n: i + 1 });

            tiles.push(
                <button
                    key={i}
                    aria-label={tileLabel}
                    className={`mine-tile ${statusClass} ${(!isPlaying || isRevealed) ? 'inactive' : ''}`}
                    onClick={() => {
                        if (!isPlaying || isRevealed) return;
                        handleTileClick(i);
                    }}
                    onMouseEnter={() => setIsHovering(i)}
                    onMouseLeave={() => setIsHovering(null)}
                >
                    <div className="mine-tile-inner">
                        {content}
                    </div>
                </button>
            );
        }
        return tiles;
    };

    return (
        <div className="mines-game">
            <div className="game-container">
                {/* Sidebar Controls */}
                <MobileBetSheet title={t('mines.betControls')} className="mines-bet-sheet">
                    <div className="mines-sidebar">
                    <div className="mines-sidebar-content">
                        <div className="mines-bet-panel">
                            {/* Bet Amount */}
                            <div className="form-group">
                                <div className="form-header">
                                    <label className="form-label" style={{ margin: 0 }}>{t('mines.betAmount')}</label>
                                    <Text type="secondary" style={{ margin: 0 }}><Coins value={betAmount ?? 0} /></Text>
                                </div>
                                <div className="input-row">
                                    <InputNumber
                                        value={betAmount === 0 ? null : betAmount}
                                        onChange={(val) => setBetAmount(Math.max(0, isNaN(Number(val)) ? 0 : Number(val)))}
                                        min={0}
                                        step={0.01}
                                        aria-label={t('mines.betAmountAria')}
                                        disabled={isPlaying}
                                        style={{ flex: 1 }}
                                        controls={false}
                                        formatter={(v) => `${v}`}
                                        parser={(v) => v.replace(/,/g, '.')}
                                        addonBefore={
                                            <CoinIcon size={18} />
                                        }
                                    />
                                    <Button.Group className="dino-btn-group">
                                        <Button
                                            onClick={handleBetAmountHalf}
                                            disabled={isPlaying}
                                            aria-label={t('mines.half')}
                                        >
                                            ½
                                        </Button>
                                        <Button
                                            onClick={handleBetAmountDouble}
                                            disabled={isPlaying}
                                            aria-label={t('mines.double')}
                                        >
                                            2×
                                        </Button>
                                    </Button.Group>
                                </div>
                            </div>


                            {/* Mines Selection */}
                            <div className="form-group mobile-sheet-secondary">
                                <label className="form-label">{t('mines.minesLabel')}</label>
                                <div className="mines-select-wrapper">
                                    <select
                                        className="mines-select"
                                        aria-label={t('mines.minesSelectAria')}
                                        value={minesCount}
                                        onChange={handleMinesChange}
                                        disabled={isPlaying}
                                    >
                                        {[...Array(24)].map((_, i) => (
                                            <option key={i + 1} value={i + 1}>{i + 1}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Gems Display */}
                            <div className="form-group mobile-sheet-secondary">
                                <label className="form-label">{t('mines.gemsLabel')}</label>
                                <div className="input-with-controls">
                                    <input
                                        type="text"
                                        className="mines-input"
                                        value={25 - minesCount}
                                        aria-label={t('mines.gemsAria')}
                                        readOnly
                                        disabled={isPlaying}
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            {!isPlaying ? (
                                <button className="btn-bet-mines" onClick={startGame}>
                                    {t('mines.bet')}
                                </button>
                            ) : (
                                <>
                                    <button
                                        className="btn-bet-mines"
                                        onClick={cashout}
                                        disabled={revealedTiles.length === 0}
                                    >
                                        {t('mines.cashOut')}
                                    </button>
                                    <button
                                        className="btn-random-pick mobile-sheet-secondary"
                                        onClick={pickRandom}
                                    >
                                        {t('mines.randomPick')}
                                    </button>
                                </>
                            )}

                            {/* Total Profit Display (Updated real-time as you pick) */}
                            <div className="form-group mobile-sheet-secondary" style={{ marginTop: 'auto' }}>
                                <div className="form-header">
                                    <label className="form-label" style={{ margin: 0 }}>{t('mines.totalProfit', { multiplier: formatMultiplier(currentMultiplier) })}</label>
                                    <span style={{ color: revealedTiles.length > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
                                        <Coins value={potentialWin - betAmount} />
                                    </span>
                                </div>
                                <div className="input-with-controls">
                                    <input
                                        type="text"
                                        className="mines-input"
                                        value={formatCoins(revealedTiles.length > 0 ? potentialWin : betAmount)}
                                        aria-label={t('mines.totalProfitAria')}
                                        readOnly
                                    />
                                    <div className="mines-input-addon">
                                        <CoinIcon size={16} />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Left Sidebar Footer */}
                    <div className="sidebar-footer mobile-sheet-secondary">
                        <div className="footer-buttons">
                            <button
                                className={`footer-btn ${statsDrawerOpen ? 'active' : ''}`}
                                onClick={() => setStatsDrawerOpen(true)}
                                title={t('mines.liveStats')}
                                aria-label={t('mines.liveStats')}
                            >
                                <StatsIcon />
                            </button>
                            <button
                                className={`footer-btn ${historyModalOpen ? 'active' : ''}`}
                                onClick={() => setHistoryModalOpen(true)}
                                title={t('mines.historyTitle')}
                                aria-label={t('mines.historyTitle')}
                            >
                                <HistoryIcon />
                            </button>
                            <button
                                className="footer-btn"
                                onClick={() => setFairnessModalOpen(true)}
                                title={t('mines.fairnessModal.title')}
                                aria-label={t('mines.fairnessModal.title')}
                            >
                                <SafetyCertificateOutlined style={{ fontSize: 18 }} />
                            </button>
                        </div>
                    </div>
                    </div>
                </MobileBetSheet>

                {/* Game Display Wrapper */}
                <div className="mines-display-wrapper">
                    <div className="mines-display">
                        <div className="mines-grid" role="group" aria-label={t('mines.board')}>
                            {renderGrid()}
                        </div>
                    </div>

                    {/* Debug Overlay */}
                    {isDebugMode && debugData && (
                        <div className="fixed-widget debug-widget fade-in-scale" ref={debugWidgetRef}>
                            <div className="widget-header debug-widget-header" onMouseDown={handleDebugDragStart}>
                                <div className="widget-title">
                                    <BugOutlined style={{ color: 'var(--primary)', fontSize: 18 }} />
                                    <span style={{ color: 'var(--primary)' }}>{t('mines.debug.title')}</span>
                                </div>
                                <div className="widget-actions">
                                    <button className="widget-btn-icon" aria-label={t('mines.debug.close')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setIsDebugMode(false)}>
                                        <CloseOutlined />
                                    </button>
                                </div>
                            </div>
                            <div className="widget-content debug-widget-content">
                                <div className="debug-row">
                                    <span className="debug-label">{t('mines.debug.nextHash')}</span>
                                    <span className="debug-value">{debugData.hash.substring(0, 16)}...</span>
                                </div>
                                <div className="debug-row">
                                    <span className="debug-label">{t('mines.debug.clientSeed')}</span>
                                    <span className="debug-value">{fairnessData.clientSeed?.substring(0, 10)}...</span>
                                </div>
                                <div className="debug-row">
                                    <span className="debug-label">{t('mines.debug.nextNonce')}</span>
                                    <span className="debug-value">{debugData.nonce}</span>
                                </div>
                                <div className="debug-target">
                                    {t('mines.debug.mines')} <span className="target-bin">{minesCount}</span>
                                    <div style={{ fontSize: 13, color: '#fff', marginTop: 4, textShadow: 'none' }}>
                                        {t('mines.debug.positions')} <span style={{ color: '#ff4d4f' }}>[{debugData.minePositions.join(', ')}]</span>
                                    </div>
                                </div>
                                <div className="mines-debug-grid">
                                    {Array.from({ length: 25 }, (_, i) => (
                                        <div key={i} className={`mines-debug-cell ${debugData.minePositions.includes(i) ? 'is-mine' : 'is-gem'}`}>
                                            {debugData.minePositions.includes(i) ? '💣' : '💎'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom Controls */}
                    <div className="game-controls">
                        <Space>
                            <Tooltip title={t('mines.controls.settings')}>
                                <Button type="text" icon={<SettingOutlined />} className="control-btn" aria-label={t('mines.controls.settings')} />
                            </Tooltip>
                            <Tooltip title={isFullscreen ? t('mines.controls.exitFullscreen') : t('mines.controls.fullscreen')}>
                                <Button type="text" icon={isFullscreen ? <FullscreenExitOutlined /> : <ExpandOutlined />} className="control-btn" aria-label={isFullscreen ? t('mines.controls.exitFullscreen') : t('mines.controls.fullscreen')} onClick={toggleFullscreen} />
                            </Tooltip>
                            <Tooltip title={soundEnabled ? t('mines.controls.mute') : t('mines.controls.unmute')}>
                                <Button type="text" icon={<SoundOutlined />} className={`control-btn ${!soundEnabled ? 'muted' : ''}`} aria-label={soundEnabled ? t('mines.controls.mute') : t('mines.controls.unmute')} onClick={() => setSoundEnabled(!soundEnabled)} />
                            </Tooltip>
                            {/* Debug shows the next result before it is played: development builds only. */}
                            {import.meta.env.DEV && (
                                <Tooltip title={isDebugMode ? t('mines.controls.disableDebug') : t('mines.controls.enableDebug')}>
                                    <Button
                                        type="text"
                                        icon={<BugOutlined />}
                                        className={`control-btn ${isDebugMode ? 'active-debug' : ''}`}
                                        aria-label={isDebugMode ? t('mines.controls.disableDebug') : t('mines.controls.enableDebug')}
                                        style={{ color: isDebugMode ? 'var(--primary)' : undefined }}
                                        onClick={() => setIsDebugMode(!isDebugMode)}
                                    />
                                </Tooltip>
                            )}
                        </Space>
                        <span className="logo"><Logo size={22} /></span>
                        <Button type="text" icon={<SafetyCertificateOutlined />} className="fairness-btn" onClick={() => setFairnessModalOpen(true)}>
                            {t('mines.fairness')}
                        </Button>
                    </div>
                </div>
            </div>

            <Modal
                title={
                    <Space>
                        <SafetyCertificateOutlined style={{ color: 'var(--primary)' }} />
                        <span>{t('mines.fairnessModal.title')}</span>
                    </Space>
                }
                open={fairnessModalOpen}
                onCancel={() => setFairnessModalOpen(false)}
                footer={null}
                width={480}
                rootClassName="mines-fairness-modal-portal mobile-game-modal"
                className="fairness-modal box-modal-3d"
                centered
                styles={{
                    content: { background: '#1a2c38', padding: 0 }
                }}
            >
                <div className="fairness-header">
                    <Title level={5}>
                        <CheckCircleOutlined style={{ marginRight: 8 }} />
                        {t('mines.fairnessModal.headline')}
                    </Title>
                    <Paragraph>{t('mines.fairnessModal.description')}</Paragraph>
                </div>

                <div className="fairness-item">
                    <span className="fairness-label">{t('games.serverSeedHash')}</span>
                    <div className="fairness-value">
                        <Text copyable={{ text: fairnessData.serverSeedHash }} style={{ fontSize: 11, wordBreak: 'break-all' }}>
                            {fairnessData.serverSeedHash?.slice(0, 24)}...
                        </Text>
                    </div>
                </div>

                <div className="fairness-item">
                    <span className="fairness-label">{t('games.clientSeed')}</span>
                    <div className="fairness-value" style={{ display: 'flex', gap: 6 }}>
                        <Input
                            size="small"
                            value={clientSeedInput}
                            onChange={e => setClientSeedInput(e.target.value)}
                            style={{ background: '#2f4553', border: 'none', color: '#fff', flex: 1, fontSize: 12 }}
                        />
                        <Button size="small" onClick={handleChangeClientSeed} icon={<CheckCircleOutlined />} aria-label={t('mines.fairnessModal.applySeed')} title={t('mines.fairnessModal.applySeed')} />
                    </div>
                </div>

                <div className="fairness-item">
                    <span className="fairness-label">{t('games.nonce')}</span>
                    <div className="fairness-value">
                        <Text style={{ background: 'rgba(47, 69, 83, 0.5)', padding: '4px 12px', borderRadius: 6, color: '#fff' }}>
                            {fairnessData.nonce}
                        </Text>
                    </div>
                </div>

                <div className="fairness-item">
                    <span className="fairness-label">{t('mines.fairnessModal.minesCount')}</span>
                    <div className="fairness-value">
                        <Tag color="error">{t('mines.minesCount', { count: minesCount })}</Tag>
                    </div>
                </div>

                <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

                {revealedSeed && (
                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {t('mines.fairnessModal.previousSeed')}
                        </Text>
                        <div style={{ background: '#0f212e', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
                            <Text copyable={{ text: revealedSeed.serverSeed }} style={{ fontSize: 10, wordBreak: 'break-all', color: '#4ade80' }}>
                                {revealedSeed.serverSeed}
                            </Text>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={handleRotateSeed} style={{ flex: 1, background: '#2f4553', border: 'none', color: '#fff' }}>
                        <ReloadOutlined /> {t('games.rotateSeed')}
                    </Button>
                    <Button type="primary" onClick={() => setFairnessModalOpen(false)} style={{ flex: 1, background: 'var(--primary)', border: 'none', color: '#000', fontWeight: 'bold' }}>
                        {t('mines.close')}
                    </Button>
                </div>
            </Modal>

            {/* Play History & Dashboard Modal */}
            <Modal
                title={null}
                open={historyModalOpen}
                onCancel={() => setHistoryModalOpen(false)}
                footer={null}
                width={700}
                centered
                closable={true}
                rootClassName="mines-history-modal-portal mobile-game-modal"
                className="box-modal-3d"
                closeIcon={<CloseOutlined />}
            >
                <div className="history-window-header-title">
                    <div className="icon-wrapper">
                        <HistoryIcon />
                    </div>
                    {t('mines.historyTitle')}
                </div>

                <div className="history-window-content" style={{ marginTop: '24px' }}>

                    <div className="dashboard-section">
                        <h3 className="section-title">{t('mines.stats.lifetime')}</h3>
                        <div className="glass-panel">
                            <Row gutter={[24, 24]}>
                                <Col span={8}>
                                    <Statistic
                                        title={<span style={{ color: '#94a3b8' }}>{t('mines.stats.totalProfit')}</span>}
                                        value={totalProfit}
                                        formatter={(v) => formatCoins(v)}
                                        prefix={<CoinIcon size={18} />}
                                        valueStyle={{ color: totalProfit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}
                                    />
                                </Col>
                                <Col span={8}>
                                    <Statistic
                                        title={<span style={{ color: '#94a3b8' }}>{t('mines.stats.totalBets')}</span>}
                                        value={winsCount + lossesCount}
                                        valueStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                                    />
                                </Col>
                                <Col span={8}>
                                    <Statistic
                                        title={<span style={{ color: '#94a3b8' }}>{t('mines.stats.winRate')}</span>}
                                        value={winsCount + lossesCount > 0 ? (winsCount / (winsCount + lossesCount) * 100) : 0}
                                        formatter={(v) => formatNumber(v, 1)}
                                        suffix="%"
                                        valueStyle={{ color: '#fbbf24', fontWeight: 'bold' }}
                                    />
                                </Col>
                            </Row>
                        </div>
                    </div>

                    <div className="dashboard-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 className="section-title" style={{ margin: 0 }}>{t('mines.stats.recent')}</h3>
                            <Tooltip title={t('mines.stats.resetStats')}>
                                <Button
                                    type="text"
                                    icon={<ReloadOutlined style={{ color: '#94a3b8' }} />}
                                    aria-label={t('mines.stats.resetStats')}
                                    onClick={() => {
                                        setWinRecords([]);
                                        setWinsCount(0);
                                        setLossesCount(0);
                                        setTotalProfit(0);
                                        profitHistoryRef.current = [0];
                                    }}
                                />
                            </Tooltip>
                        </div>
                        <div className="glass-panel" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {winRecords.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                                    <HistoryIcon style={{ fontSize: 48, opacity: 0.2, marginBottom: 16 }} />
                                    <p>{t('mines.stats.empty')}</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {[...winRecords].reverse().map((record, i) => (
                                        <div key={i} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '12px 16px',
                                            background: 'rgba(0,0,0,0.2)',
                                            borderRadius: '8px'
                                        }}>
                                            <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                                                {record > 0 ? t('mines.stats.win') : t('mines.stats.loss')}
                                            </span>
                                            <span style={{
                                                color: record > 0 ? '#4ade80' : '#f87171',
                                                fontWeight: 'bold',
                                                fontFamily: 'monospace',
                                                fontSize: '15px'
                                            }}>
                                                {record > 0 ? '+' : ''}<Coins value={record} />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Live Stats Draggable Widget */}
            {statsDrawerOpen && (
                <div className="fixed-widget fade-in-scale" ref={widgetRef}>
                    <div className="widget-header" onMouseDown={handleDragStart}>
                        <div className="widget-title">
                            <LineChartOutlined style={{ fontSize: 20, color: '#94a3b8' }} />
                            <span>{t('mines.liveStats')}</span>
                        </div>
                        <div className="widget-actions">
                            <Tooltip title={t('mines.stats.resetLive')} placement="topRight">
                                <button className="widget-btn-icon" aria-label={t('mines.stats.resetLive')} onMouseDown={(e) => e.stopPropagation()} onClick={() => {
                                    setWinRecords([]);
                                    setWinsCount(0);
                                    setLossesCount(0);
                                    setTotalProfit(0);
                                    profitHistoryRef.current = [0];
                                }}>
                                    <ReloadOutlined />
                                </button>
                            </Tooltip>
                            <Tooltip title={t('mines.stats.viewHistory')} placement="topRight">
                                <button className="widget-btn-icon" aria-label={t('mines.stats.viewHistory')} onMouseDown={(e) => e.stopPropagation()} onClick={() => { setHistoryModalOpen(true); setStatsDrawerOpen(false); }}>
                                    <RightOutlined />
                                </button>
                            </Tooltip>
                            <button className="widget-btn-icon" aria-label={t('mines.close')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setStatsDrawerOpen(false)}>
                                <CloseOutlined />
                            </button>
                        </div>
                    </div>

                    <div className="widget-content">
                        {/* Profit Overview */}
                        <div className="profit-box">
                            <div className="profit-main">
                                <p className="label">{t('mines.stats.profit')}</p>
                                <p className="value" style={{ color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}>
                                    {totalProfit >= 0 ? '+' : ''}<Coins value={totalProfit} />
                                </p>
                            </div>
                            <div className="profit-divider"></div>
                            <div className="profit-stats">
                                <div className="stat-row">
                                    <p className="label">{t('mines.stats.wins')}</p>
                                    <p className="value" style={{ color: '#4ade80' }}>{formatNumber(winsCount)}</p>
                                </div>
                                <div className="stat-row">
                                    <p className="label">{t('mines.stats.losses')}</p>
                                    <p className="value" style={{ color: '#f87171' }}>{formatNumber(lossesCount)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Chart.js Container */}
                        <div className="chart-box" onMouseLeave={() => setHoveredProfitValue(null)}>
                            <p className="label">{t('mines.stats.profitHistory')}</p>
                            {hoveredProfitValue !== null && (
                                <p className="hovered-value" style={{ color: hoveredProfitValue >= 0 ? '#4ade80' : '#f87171' }}>
                                    {hoveredProfitValue >= 0 ? '+' : ''}<Coins value={hoveredProfitValue} />
                                </p>
                            )}
                            <div className="canvas-wrapper">
                                <canvas ref={chartCanvasRef}></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MinesGame;
