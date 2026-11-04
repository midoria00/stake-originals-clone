// Main PlinkoGame - Enhanced with Special Balls & Colorful UI
import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Button,
    Space,
    Tooltip,
    Typography,
    Modal,
    Drawer,
    Statistic,
    Row,
    Col,
    Card,
    Tag,
    notification,
    Badge
} from 'antd';
import {
    ExpandOutlined,
    BarChartOutlined,
    SafetyCertificateOutlined,
    FullscreenExitOutlined,
    TrophyOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    FireOutlined,
    StarOutlined,
    RightOutlined,
    BugOutlined,
    CloseOutlined,
    ReloadOutlined,
    LineChartOutlined
} from '@ant-design/icons';
import Chart from 'chart.js/auto';
import Plinko from './Plinko';
import Sidebar from './Sidebar';
import MobileBetSheet from '../MobileBetSheet';
import { DEFAULT_BALANCE, getBinColors, BIN_PAYOUTS } from './constants';
import { dropPlinkoBall } from './dropPlinkoBall';
import { ProvablyFair } from '../../utils/ProvablyFair';
import { useWallet } from '../../context/WalletContext';
import { Coins, Logo } from '../../brand/Brand';
import { t } from '../../i18n';
import { formatNumber } from '../../i18n/format';
import './PlinkoGame.css';

const { Text, Title, Paragraph } = Typography;

// Ball types with special effects
const BALL_TYPES = {
    normal: {
        id: 'normal',
        color: '#ff4d4f',
        multiplierBonus: 1,
        icon: '🪙',
        image: '/images/coins/coin_original.svg',
        cost: 1
    },
    bronze: {
        id: 'bronze',
        color: '#cd7f32',
        multiplierBonus: 2,
        icon: '🟤',
        image: '/images/coins/coin_bronze.svg',
        cost: 2
    },
    silver: {
        id: 'silver',
        color: '#bdc3c7',
        multiplierBonus: 3,
        icon: '⚪',
        image: '/images/coins/coin_silver.svg',
        cost: 3
    },
    emerald: {
        id: 'emerald',
        color: '#2ecc71',
        multiplierBonus: 5,
        icon: '🟢',
        image: '/images/coins/coin_emerald.svg',
        cost: 5
    },
    ruby: {
        id: 'ruby',
        color: '#e74c3c',
        multiplierBonus: 10,
        icon: '🔴',
        image: '/images/coins/coin_ruby.svg',
        cost: 10
    },
    sapphire: {
        id: 'sapphire',
        color: '#3498db',
        multiplierBonus: 20,
        icon: '🔵',
        image: '/images/coins/coin_sapphire.svg',
        cost: 20
    }
};

// Special balls (2-20x cost and payout) are hidden: the wallet only charged 1x and paid the base
// multiplier, so their records never matched the balance. With cost == bonus they equal a bigger stake.
const AVAILABLE_BALL_TYPES = { normal: BALL_TYPES.normal };

function PlinkoGame() {
    // Shared Wallet
    const { balance, placeBet, addWinnings, showToast } = useWallet()
    // State
    const [betAmount, setBetAmount] = useState(1);
    const [rowCount, setRowCount] = useState(16);
    const [riskLevel, setRiskLevel] = useState('medium');
    const [winRecords, setWinRecords] = useState([]);
    const [selectedBallType, setSelectedBallType] = useState('normal');

    // Provably Fair System
    const [provablyFair] = useState(() => new ProvablyFair());

    // Streak tracking
    const [currentStreak, setCurrentStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);

    // UI States
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [statsDrawerOpen, setStatsDrawerOpen] = useState(false);
    const [fairnessModalOpen, setFairnessModalOpen] = useState(false);
    const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

    // Debug State
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [debugData, setDebugData] = useState(null);

    const engineRef = useRef(null);
    const pendingDropsRef = useRef(0);
    const gameDisplayRef = useRef(null);
    const chartCanvasRef = useRef(null);
    const chartInstanceRef = useRef(null);

    // Drag refs (Live Stats)
    const widgetRef = useRef(null);
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const profitHistoryRef = useRef([0]);

    // Drag refs (Debug Widget)
    const debugWidgetRef = useRef(null);
    const isDebugDragging = useRef(false);
    const debugDragOffset = useRef({ x: 0, y: 0 });

    // Chart.js State
    const [hoveredProfitValue, setHoveredProfitValue] = useState(null);

    // Calculate statistics
    const winsCount = winRecords.filter(r => r.profit >= 0).length;
    const lossesCount = winRecords.filter(r => r.profit < 0).length;
    const stats = {
        totalDrops: winRecords.length,
        totalWagered: winRecords.reduce((sum, r) => sum + r.betAmount, 0),
        totalProfit: winRecords.reduce((sum, r) => sum + r.profit, 0),
        biggestWin: winRecords.length > 0 ? Math.max(...winRecords.map(r => r.payout.multiplier)) : 0,
        avgMultiplier: winRecords.length > 0
            ? (winRecords.reduce((sum, r) => sum + r.payout.multiplier, 0) / winRecords.length).toFixed(2)
            : 0,
        rubyBalls: winRecords.filter(r => r.ballType === 'ruby').length,
        sapphireBalls: winRecords.filter(r => r.ballType === 'sapphire').length,
    };

    // Current ball type
    const currentBall = BALL_TYPES[selectedBallType];

    // Chart Data for Live Stats
    const chartData = winRecords.slice(-40);
    const maxProfit = chartData.length > 0 ? Math.max(0, ...chartData.map(r => r.profit)) : 1;
    const minProfit = chartData.length > 0 ? Math.min(0, ...chartData.map(r => r.profit)) : -1;
    const profitRangeMax = Math.max(maxProfit, 1);
    const profitRangeMin = Math.abs(Math.min(minProfit, -1));

    // Handle balance change
    const handleBalanceChange = useCallback((amount) => {
        if (amount > 0) {
            addWinnings(amount, 'plinko');
        }
        // Negative amounts (bets) are handled by placeBet in handleDropBall
    }, [addWinnings]);

    // Calculate bonus multiplier for special balls
    const calculateBonusMultiplier = useCallback((ballType) => {
        const ball = BALL_TYPES[ballType];
        return ball.multiplierBonus || 1;
    }, []);

    // Handle ball enter bin
    const handleBallEnterBin = useCallback((data) => {
        const ballType = data.ballType || selectedBallType;
        const actualBall = BALL_TYPES[ballType] || BALL_TYPES.normal;

        const bonusMultiplier = calculateBonusMultiplier(ballType);
        const finalMultiplier = data.payout.multiplier * bonusMultiplier;
        const finalPayout = data.betAmount * finalMultiplier;
        const profit = finalPayout - (data.betAmount * actualBall.cost);

        const newRecord = {
            id: Date.now() + Math.random(),
            ...data,
            ballType: ballType,
            bonusMultiplier,
            payout: {
                ...data.payout,
                multiplier: finalMultiplier,
                value: finalPayout,
                originalMultiplier: data.payout.multiplier
            },
            profit
        };

        setWinRecords(prev => [...prev, newRecord]);

        // Track streak
        if (profit > 0) {
            setCurrentStreak(prev => {
                const newStreak = prev + 1;
                setMaxStreak(max => Math.max(max, newStreak));
                return newStreak;
            });
        } else {
            setCurrentStreak(0);
        }

        // Adjust balance for special ball cost difference
        const costAdjustment = data.betAmount * (actualBall.cost - 1);
        if (costAdjustment !== 0) {
            handleBalanceChange(-costAdjustment);
        }
    }, [selectedBallType, calculateBonusMultiplier, handleBalanceChange]);

    // Drag handler for widget
    const handleDragStart = useCallback((e) => {
        if (!widgetRef.current) return;
        isDragging.current = true;
        const rect = widgetRef.current.getBoundingClientRect();
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        const handleMouseMove = (moveEvt) => {
            if (!isDragging.current || !widgetRef.current) return;
            const newX = moveEvt.clientX - dragOffset.current.x;
            const newY = moveEvt.clientY - dragOffset.current.y;
            // Clamp to viewport
            const maxX = window.innerWidth - widgetRef.current.offsetWidth;
            const maxY = window.innerHeight - widgetRef.current.offsetHeight;
            widgetRef.current.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
            widgetRef.current.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
            widgetRef.current.style.right = 'auto';
            widgetRef.current.style.bottom = 'auto';
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
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
            // Clamp to viewport
            const maxX = window.innerWidth - debugWidgetRef.current.offsetWidth;
            const maxY = window.innerHeight - debugWidgetRef.current.offsetHeight;
            debugWidgetRef.current.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
            debugWidgetRef.current.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
            debugWidgetRef.current.style.right = 'auto';
            debugWidgetRef.current.style.bottom = 'auto';
            debugWidgetRef.current.style.transform = 'none'; // Prevents centering transform from messing up
        };

        const handleMouseUp = () => {
            isDebugDragging.current = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    // Destroy chart when window closes
    useEffect(() => {
        if (!statsDrawerOpen) {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        }
    }, [statsDrawerOpen]);

    // Setup Chart.js after canvas mounts and when winRecords change
    useEffect(() => {
        if (!statsDrawerOpen || !chartCanvasRef.current) return;

        const WIN_COLOR = 'rgb(74, 222, 128)';
        const WIN_COLOR_FILL = 'rgba(74, 222, 128, 0.3)';
        const LOSS_COLOR = 'rgb(248, 113, 113)';
        const LOSS_COLOR_FILL = 'rgba(248, 113, 113, 0.3)';
        const X_AXIS_COLOR = '#2a3f4d';
        const POINT_HOVER_COLOR = '#fff';

        // Profit history starting from 0
        const profitHistory = [0];
        let runningTotal = 0;
        winRecords.forEach(r => {
            runningTotal += r.profit;
            profitHistory.push(runningTotal);
        });
        profitHistoryRef.current = profitHistory;

        if (chartInstanceRef.current) {
            // Update existing chart
            chartInstanceRef.current.data.labels = Array(profitHistory.length).fill(0);
            chartInstanceRef.current.data.datasets[0].data = profitHistory;
            chartInstanceRef.current.update();
        } else {
            // Initialize new chart
            chartInstanceRef.current = new Chart(chartCanvasRef.current, {
                type: 'line',
                data: {
                    labels: Array(profitHistory.length).fill(0),
                    datasets: [
                        {
                            label: t('plinko.profit'),
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
            }
        };
    }, []);

    // Update debug info whenever ready or after a drop
    useEffect(() => {
        if (isDebugMode && provablyFair) {
            provablyFair.peekPlinkoPath(rowCount).then(res => {
                setDebugData(res);
            });
        }
    }, [isDebugMode, rowCount, provablyFair, winRecords]);

    // Drop ball
    const handleDropBall = useCallback(async (isCancelled) => {
        // The board switches rows only after that row's drop positions are loaded; wait until it matches.
        if (engineRef.current && engineRef.current.rowCount !== rowCount) return 'busy';
        const result = await dropPlinkoBall({
            engine: engineRef.current,
            pendingDrops: pendingDropsRef,
            provablyFair,
            rowCount,
            betAmount,
            currentBall,
            selectedBallType,
            placeBet: (amount) => placeBet(amount, 'plinko'),
            isCancelled,
        });
        if (result === 'insufficient-funds') showToast('error', t('plinko.insufficientTitle'), t('plinko.insufficientBody'));
        return result;
    }, [currentBall, rowCount, provablyFair, selectedBallType, betAmount, placeBet, showToast]);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            if (gameDisplayRef.current) {
                gameDisplayRef.current.requestFullscreen().then(() => {
                    setIsFullscreen(true);
                });
            }
        } else {
            document.exitFullscreen().then(() => {
                setIsFullscreen(false);
            });
        }
    }, []);

    // Check for outstanding balls
    const hasOutstandingBalls = engineRef.current?.hasOutstandingBalls?.() || false;

    return (
        <div className="plinko-page">
            <div className="plinko-main" ref={gameDisplayRef}>
                <div className="plinko-container">
                    {/* Sidebar - LEFT */}
                    <MobileBetSheet title={t('plinko.betControls')} className="plinko-bet-sheet">
                        <div className="plinko-sidebar-wrapper">
                            <Sidebar
                                balance={balance}
                                betAmount={betAmount}
                                setBetAmount={setBetAmount}
                                rowCount={rowCount}
                                setRowCount={setRowCount}
                                riskLevel={riskLevel}
                                setRiskLevel={setRiskLevel}
                                hasOutstandingBalls={hasOutstandingBalls}
                                onDropBall={handleDropBall}
                                onStatsClick={() => setStatsDrawerOpen(true)}
                                isStatsOpen={statsDrawerOpen}
                                selectedBallType={selectedBallType}
                                setSelectedBallType={setSelectedBallType}
                                ballTypes={AVAILABLE_BALL_TYPES}
                            />
                        </div>
                    </MobileBetSheet>

                    {/* Plinko Game Area */}
                    <div className="plinko-game-wrapper">
                        <Plinko
                            rowCount={rowCount}
                            riskLevel={riskLevel}
                            betAmount={betAmount}
                            winRecords={winRecords}
                            onBallEnterBin={handleBallEnterBin}
                            onBalanceChange={handleBalanceChange}
                            engineRef={engineRef}
                            ballColor={currentBall.color}
                        />

                        {/* Debug Overlay */}
                        {isDebugMode && debugData && (
                            <div className="fixed-widget debug-widget fade-in-scale" ref={debugWidgetRef}>
                                <div className="widget-header debug-widget-header" onMouseDown={handleDebugDragStart}>
                                    <div className="widget-title">
                                        <BugOutlined style={{ color: 'var(--primary)', fontSize: 18 }} />
                                        <span style={{ color: 'var(--primary)' }}>{t('plinko.debug.title')}</span>
                                    </div>
                                    <div className="widget-actions">
                                        <button className="widget-btn-icon" aria-label={t('plinko.close')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setIsDebugMode(false)}>
                                            <CloseOutlined />
                                        </button>
                                    </div>
                                </div>
                                <div className="widget-content debug-widget-content">
                                    <div className="debug-row">
                                        <span className="debug-label">{t('plinko.debug.nextHash')}</span>
                                        <span className="debug-value">{debugData.hash.substring(0, 16)}...</span>
                                    </div>
                                    <div className="debug-row">
                                        <span className="debug-label">{t('plinko.debug.nextNonce')}</span>
                                        <span className="debug-value">{debugData.nonce}</span>
                                    </div>
                                    <div className="debug-target">
                                        {t('plinko.debug.targetBin')}: <span className="target-bin">#{debugData.binIndex}</span>
                                        {' → '}
                                        <span className="target-payout">
                                            {BIN_PAYOUTS[rowCount]?.[riskLevel]?.[debugData.binIndex] ?? '?'}×
                                        </span>
                                    </div>
                                    <div className="debug-path-row">
                                        {debugData.path.map((dir, i) => (
                                            <span key={i} className={`debug-path-dot ${dir === 0 ? 'left' : 'right'}`}>
                                                {dir === 0 ? t('plinko.debug.left') : t('plinko.debug.right')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bottom Controls */}
                        <div className="plinko-controls">
                            <Space>
                                <Tooltip title={isFullscreen ? t('plinko.exitFullscreen') : t('games.fullscreen')}>
                                    <Button
                                        type="text"
                                        aria-label={isFullscreen ? t('plinko.exitFullscreen') : t('games.fullscreen')}
                                        icon={isFullscreen ? <FullscreenExitOutlined /> : <ExpandOutlined />}
                                        className="control-btn"
                                        onClick={toggleFullscreen}
                                    />
                                </Tooltip>
                                <Tooltip title={t('plinko.liveStats')}>
                                    <Button
                                        type="text"
                                        aria-label={t('plinko.liveStats')}
                                        icon={<BarChartOutlined />}
                                        className="control-btn"
                                        onClick={() => setStatsDrawerOpen(true)}
                                    />
                                </Tooltip>
                                {/* Debug shows the next result before it is played: development builds only. */}
                                {import.meta.env.DEV && (
                                    <Tooltip title={isDebugMode ? t('plinko.debugOff') : t('plinko.debugOn')}>
                                        <Button
                                            type="text"
                                            aria-label={isDebugMode ? t('plinko.debugOff') : t('plinko.debugOn')}
                                            icon={<BugOutlined />}
                                            className={`control-btn ${isDebugMode ? 'active-debug' : ''}`}
                                            style={{ color: isDebugMode ? 'var(--primary)' : undefined }}
                                            onClick={() => setIsDebugMode(!isDebugMode)}
                                        />
                                    </Tooltip>
                                )}
                            </Space>

                            <Logo size={22} />

                            <Button
                                type="text"
                                icon={<SafetyCertificateOutlined />}
                                className="fairness-btn"
                                onClick={() => setFairnessModalOpen(true)}
                            >
                                {t('games.fairness')}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Recent Plays (always visible) */}
                <div className="recent-plays">
                    <div className="recent-plays-header">
                        <ThunderboltOutlined />
                        <span>{t('plinko.recentPlays')}</span>
                        <span className="total-plays">{t('plinko.drops', { count: winRecords.length })}</span>
                    </div>
                    <div className="recent-plays-bar">
                        <div className="recent-plays-list">
                            {winRecords.length === 0 ? (
                                <div className="recent-plays-empty">{t('plinko.noDrops')}</div>
                            ) : (
                                winRecords.slice(-30).reverse().map((record) => {
                                    const colors = getBinColors(record.rowCount);
                                    const actualBall = BALL_TYPES[record.ballType] || BALL_TYPES.normal;
                                    const isSpecial = actualBall.id !== 'normal';
                                    return (
                                        <Tooltip
                                            key={record.id}
                                            title={
                                                <div>
                                                    <div>{t(`plinko.balls.${actualBall.id}`)}</div>
                                                    <div>{t('plinko.payout')}: <Coins value={record.payout.value} size={14} /></div>
                                                    {isSpecial && <div>{t('plinko.bonus')}: {record.bonusMultiplier.toFixed(2)}×</div>}
                                                </div>
                                            }
                                        >
                                            <Tag
                                                className="play-tag"
                                                style={{
                                                    backgroundColor: colors.background[record.binIndex],
                                                    color: '#000'
                                                }}
                                            >
                                                {isSpecial && (
                                                    <div
                                                        className="ball-color-circle small"
                                                        style={{ backgroundImage: `url(${actualBall.image})`, backgroundSize: 'cover', backgroundColor: 'transparent' }}
                                                    ></div>
                                                )}
                                                {record.payout.multiplier.toFixed(1)}{record.payout.multiplier < 100 ? '×' : ''}
                                            </Tag>
                                        </Tooltip>
                                    );
                                })
                            )}
                        </div>
                        <div className="recent-plays-actions">
                            <Button
                                type="text"
                                className="view-all-btn"
                                aria-label={t('plinko.openHistory')}
                                onClick={() => setHistoryDrawerOpen(true)}
                                icon={<RightOutlined />}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Statistics Mini Window / Profit Chart */}
            {statsDrawerOpen && (
                <div className="fixed-widget fade-in-scale" ref={widgetRef}>
                    <div className="widget-header" onMouseDown={handleDragStart}>
                        <div className="widget-title">
                            <LineChartOutlined style={{ fontSize: 20, color: '#94a3b8' }} />
                            <span>{t('plinko.liveStats')}</span>
                        </div>
                        <div className="widget-actions">
                            <Tooltip title={t('plinko.resetStats')} placement="topRight">
                                <button className="widget-btn-icon" aria-label={t('plinko.resetStats')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setWinRecords([])}>
                                    <ReloadOutlined />
                                </button>
                            </Tooltip>
                            <button className="widget-btn-icon" aria-label={t('plinko.close')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setStatsDrawerOpen(false)}>
                                <CloseOutlined />
                            </button>
                        </div>
                    </div>

                    <div className="widget-content">
                        {/* Profit Overview */}
                        <div className="profit-box">
                            <div className="profit-main">
                                <p className="label">{t('plinko.profit')}</p>
                                <p className="value" style={{ color: stats.totalProfit >= 0 ? '#4ade80' : '#f87171' }}>
                                    <Coins value={stats.totalProfit} size={18} />
                                </p>
                            </div>
                            <div className="profit-divider"></div>
                            <div className="profit-stats">
                                <div className="stat-row">
                                    <p className="label">{t('plinko.wins')}</p>
                                    <p className="value" style={{ color: '#4ade80' }}>{formatNumber(winsCount)}</p>
                                </div>
                                <div className="stat-row">
                                    <p className="label">{t('plinko.losses')}</p>
                                    <p className="value" style={{ color: '#f87171' }}>{formatNumber(lossesCount)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Chart.js Container */}
                        <div className="chart-box" onMouseLeave={() => setHoveredProfitValue(null)}>
                            <p className="label">{t('plinko.profitHistory')}</p>
                            {hoveredProfitValue !== null && (
                                <p className="hovered-value" style={{ color: hoveredProfitValue >= 0 ? '#4ade80' : '#f87171' }}>
                                    <Coins value={hoveredProfitValue} size={16} />
                                </p>
                            )}
                            <div className="canvas-wrapper">
                                <canvas ref={chartCanvasRef}></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* History Window - sleek modern dashboard style */}
            <Modal
                title={
                    <Space className="history-window-header-title">
                        <div className="icon-wrapper"><ThunderboltOutlined /></div>
                        <span>{t('plinko.historyTitle')}</span>
                    </Space>
                }
                centered
                footer={null}
                onCancel={() => setHistoryDrawerOpen(false)}
                open={historyDrawerOpen}
                width={460}
                rootClassName="plinko-history-modal-portal mobile-game-modal"
                className="history-window box-modal-3d"
                closable={{ closeIcon: <CloseOutlined style={{ color: '#94a3b8' }} />, 'aria-label': t('plinko.close') }}
            >
                <div className="history-window-content">
                    {/* Achievements */}
                    <div className="dashboard-section">
                        <div className="section-title">{t('plinko.milestones')}</div>
                        <div className="achievements-row">
                            {(() => {
                                const achievements = [
                                    { id: 'first-drop', title: t('plinko.milestoneFirst'), unlocked: winRecords.length > 0, icon: <StarOutlined /> },
                                    { id: 'ruby-used', title: t('plinko.milestoneRuby'), unlocked: stats.rubyBalls > 0, icon: <ThunderboltOutlined /> },
                                    { id: 'sapphire-used', title: t('plinko.milestoneSapphire'), unlocked: stats.sapphireBalls > 0, icon: <StarOutlined /> },
                                    { id: 'big-win', title: t('plinko.milestoneBigWin'), unlocked: winRecords.some(w => w.payout.multiplier >= 20), icon: <TrophyOutlined /> },
                                    { id: 'hot-streak', title: t('plinko.milestoneStreak'), unlocked: maxStreak >= 5, icon: <FireOutlined /> },
                                ];
                                return achievements.map(a => (
                                    <div key={a.id} className={`achievement-badge ${a.unlocked ? 'unlocked' : 'locked'}`}>
                                        <div className="achievement-icon">{a.icon}</div>
                                        <div className="achievement-title">{a.title}</div>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Streak timeline (last 20 results) */}
                    <div className="dashboard-section">
                        <div className="section-title">{t('plinko.timeline')}</div>
                        <div className="streak-timeline glass-panel">
                            {winRecords.slice(-20).map((r, idx) => {
                                const actualBall = BALL_TYPES[r.ballType] || BALL_TYPES.normal;
                                return (
                                    <div key={r.id || idx} className={`timeline-dot ${r.profit > 0 ? 'win' : 'loss'}`} title={`${t(`plinko.balls.${actualBall.id}`)} • ${r.payout.multiplier.toFixed(2)}×`} />
                                );
                            })}
                        </div>
                    </div>

                    {/* History list */}
                    <div className="dashboard-section">
                        <div className="section-title">{t('plinko.recentList')}</div>
                        <div className="history-list">
                            {winRecords.length === 0 ? (
                                <div className="empty-state">{t('plinko.historyEmpty')}</div>
                            ) : (
                                winRecords.slice().reverse().map((r) => {
                                    const colors = getBinColors(r.rowCount);
                                    const actualBall = BALL_TYPES[r.ballType] || BALL_TYPES.normal;
                                    const isWin = r.profit >= 0;
                                    return (
                                        <div key={r.id} className="history-card glass-panel">
                                            <div className="history-card-icon">
                                                <div className="ball-color-circle medium" style={{ backgroundImage: `url(${actualBall.image})`, backgroundSize: 'cover', backgroundColor: 'transparent' }}></div>
                                            </div>
                                            <div className="history-card-info">
                                                <div className="history-card-name">{t(`plinko.balls.${actualBall.id}`)}</div>
                                                <div className="history-card-multiplier" style={{ color: colors.background[r.binIndex] || '#fff' }}>{r.payout.multiplier.toFixed(2)}×</div>
                                            </div>
                                            <div className={`history-card-profit ${isWin ? 'profit-up' : 'profit-down'}`}>
                                                {isWin ? '+' : '-'}<Coins value={Math.abs(r.profit)} size={14} />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Fairness Modal */}
            <Modal
                title={
                    <Space>
                        <SafetyCertificateOutlined style={{ color: 'var(--primary)' }} />
                        <span>{t('plinko.fairness.title')}</span>
                    </Space>
                }
                open={fairnessModalOpen}
                onCancel={() => setFairnessModalOpen(false)}
                footer={null}
                width={480}
                rootClassName="plinko-fairness-modal-portal mobile-game-modal"
                className="fairness-modal box-modal-3d"
                centered
                closable={{ 'aria-label': t('plinko.close') }}
                styles={{
                    content: { background: '#1a2c38', padding: 0 }
                }}
            >
                <div className="fairness-header">
                    <Title level={5}>
                        <CheckCircleOutlined style={{ marginRight: 8 }} />
                        {t('plinko.fairness.headline')}
                    </Title>
                    <Paragraph>{t('plinko.fairness.body')}</Paragraph>
                    <Paragraph type="secondary">{t('plinko.fairness.notVerifiable')}</Paragraph>
                </div>

                <div className="fairness-item">
                    <span className="fairness-label">{t('plinko.fairness.game')}</span>
                    <Text className="fairness-value">Plinko</Text>
                </div>
                <div className="fairness-item">
                    <span className="fairness-label">{t('plinko.fairness.drops')}</span>
                    <Text className="fairness-value">{winRecords.length}</Text>
                </div>
                <div className="fairness-item">
                    <span className="fairness-label">{t('plinko.fairness.rows')}</span>
                    <Text className="fairness-value">{rowCount}</Text>
                </div>
                <div className="fairness-item">
                    <span className="fairness-label">{t('plinko.fairness.ball')}</span>
                    <Text className="fairness-value">
                        <div className="ball-color-circle small" style={{ backgroundImage: `url(${currentBall.image})`, backgroundSize: 'cover', backgroundColor: 'transparent', marginRight: 6 }}></div>
                        {t(`plinko.balls.${currentBall.id}`)}
                    </Text>
                </div>

            </Modal>
        </div>
    );
}

export default PlinkoGame;
