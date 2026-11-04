// Sidebar Component - Direct port from Sidebar.svelte
import { useState, useRef, useEffect, useCallback } from 'react';
import { ROW_COUNT_OPTIONS, AUTO_BET_INTERVAL_MS } from './constants';
import './Sidebar.css';
import { Tooltip, InputNumber, Button, Typography } from 'antd';
import { StarOutlined } from '@ant-design/icons';
import { CoinIcon, Coins } from '../../brand/Brand';
import { t } from '../../i18n';

const { Text } = Typography;

function Sidebar({
    balance,
    betAmount,
    setBetAmount,
    rowCount,
    setRowCount,
    riskLevel,
    setRiskLevel,
    hasOutstandingBalls,
    onDropBall,
    onStatsClick,
    isStatsOpen,
    // Plinko-specific props
    selectedBallType,
    setSelectedBallType,
    ballTypes,
}) {
    const [betMode, setBetMode] = useState('manual'); // 'manual' | 'auto'
    const [autoBetInput, setAutoBetInput] = useState(0);
    const [autoBetsLeft, setAutoBetsLeft] = useState(null);
    const [isAutoBetting, setIsAutoBetting] = useState(false);
    const autoBetTickRunningRef = useRef(false);
    const autoBetSessionRef = useRef(0);

    // Validation
    const isBetAmountInvalid = !(betAmount > 0);
    const isBetExceedBalance = betAmount > balance;
    const isAutoBetInputNegative = autoBetInput < 0;
    const isDropBallDisabled = isBetAmountInvalid || isBetExceedBalance || isAutoBetInputNegative;

    // Auto bet drop ball
    const autoBetDropBall = useCallback(async () => {
        if (autoBetTickRunningRef.current) return;
        autoBetTickRunningRef.current = true;

        const session = autoBetSessionRef.current;
        try {
            const result = await onDropBall?.(() => session !== autoBetSessionRef.current);
            if (result === 'insufficient-funds') {
                setIsAutoBetting(false);
            } else if (result === 'dropped' && autoBetsLeft !== null) {
                setAutoBetsLeft(prev => prev - 1);
            }
        } finally {
            autoBetTickRunningRef.current = false;
        }
    }, [autoBetsLeft, isAutoBetting, onDropBall]);

    // Start/stop auto bet interval
    useEffect(() => {
        if (!isAutoBetting) return;

        const intervalId = setInterval(autoBetDropBall, AUTO_BET_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [isAutoBetting, autoBetDropBall]);

    useEffect(() => {
        if (autoBetsLeft === 0) setIsAutoBetting(false);
    }, [autoBetsLeft]);

    const handleBetClick = () => {
        if (betMode === 'manual') {
            onDropBall?.();
        } else if (isAutoBetting) {
            autoBetSessionRef.current++;
            setIsAutoBetting(false);
            setAutoBetsLeft(null);
        } else {
            autoBetSessionRef.current++;
            setAutoBetsLeft(autoBetInput === 0 ? null : autoBetInput);
            setIsAutoBetting(true);
        }
    };

    const handleAutoBetInputChange = (e) => {
        const value = parseInt(e.target.value);
        setAutoBetInput(isNaN(value) ? 0 : value);
    };

    const riskLevels = ['low', 'medium', 'high'];

    return (
        <div className="sidebar">
            {/* Bet Mode Tabs */}
            <div className="bet-mode-tabs">
                <button
                    className={`bet-mode-tab ${betMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setBetMode('manual')}
                    disabled={isAutoBetting}
                >
                    {t('games.manual')}
                </button>
                <button
                    className={`bet-mode-tab ${betMode === 'auto' ? 'active' : ''}`}
                    onClick={() => setBetMode('auto')}
                    disabled={isAutoBetting}
                >
                    {t('games.auto')}
                </button>
            </div>

            {/* Bet Amount */}
            <div className="form-group">
                <div className="form-header">
                    <label htmlFor="betAmount" className="form-label" style={{ margin: 0 }}>{t('games.betAmount')}</label>
                    <Text type="secondary" style={{ margin: 0 }}><Coins value={betAmount ?? 0} size={14} /></Text>
                </div>
                <div className="input-row">
                    <InputNumber
                        id="betAmount"
                        value={betAmount}
                        onChange={(val) => setBetAmount(isNaN(Number(val)) ? 0 : Number(val))}
                        min={0}
                        step={0.01}
                        disabled={isAutoBetting}
                        style={{ flex: 1 }}
                        controls={false}
                        decimalSeparator=","
                        addonBefore={<CoinIcon size={20} />}
                    />
                    <Button.Group>
                        <Button
                            onClick={() => setBetAmount(prev => parseFloat((Number(prev || 0) / 2).toFixed(2)))}
                            disabled={isAutoBetting}
                        >
                            {t('games.half')}
                        </Button>
                        <Button
                            onClick={() => setBetAmount(prev => parseFloat((Number(prev || 0) * 2).toFixed(2)))}
                            disabled={isAutoBetting}
                        >
                            {t('games.double')}
                        </Button>
                    </Button.Group>
                </div>
                {isBetAmountInvalid && (
                    <p className="error-text">{t('plinko.errors.betPositive')}</p>
                )}
                {isBetExceedBalance && (
                    <p className="error-text">{t('plinko.errors.betBalance')}</p>
                )}
            </div>

            {/* Risk Level */}
            <div className="form-group mobile-sheet-secondary">
                <label htmlFor="riskLevel" className="form-label">{t('plinko.risk')}</label>
                <select
                    id="riskLevel"
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value)}
                    disabled={hasOutstandingBalls || isAutoBetting}
                    className="form-select"
                >
                    {riskLevels.map((value) => (
                        <option key={value} value={value}>{t(`plinko.riskLevels.${value}`)}</option>
                    ))}
                </select>
            </div>

            {/* Row Count */}
            <div className="form-group mobile-sheet-secondary">
                <label htmlFor="rowCount" className="form-label">{t('plinko.rows')}</label>
                <select
                    id="rowCount"
                    value={rowCount}
                    onChange={(e) => setRowCount(parseInt(e.target.value))}
                    disabled={hasOutstandingBalls || isAutoBetting}
                    className="form-select"
                >
                    {ROW_COUNT_OPTIONS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                    ))}
                </select>
            </div>

            {/* Auto Bet Input */}
            {betMode === 'auto' && (
                <div className="form-group mobile-sheet-secondary">
                    <div className="form-label-row">
                        <label htmlFor="autoBetInput" className="form-label">{t('games.numberOfBets')}</label>
                        <span className="help-icon" title={t('plinko.unlimitedHint')} aria-label={t('plinko.unlimitedHint')}>?</span>
                    </div>
                    <div className="auto-bet-input">
                        <input
                            id="autoBetInput"
                            type="number"
                            value={isAutoBetting ? (autoBetsLeft ?? 0) : autoBetInput}
                            onChange={handleAutoBetInputChange}
                            disabled={isAutoBetting}
                            min="0"
                            inputMode="numeric"
                            className={isAutoBetInputNegative ? 'error' : ''}
                        />
                        {autoBetInput === 0 && !isAutoBetting && (
                            <span className="infinity-icon">∞</span>
                        )}
                    </div>
                    {isAutoBetInputNegative && (
                        <p className="error-text">{t('plinko.errors.autoNegative')}</p>
                    )}
                </div>
            )}

            {/* Bet Button */}
            <button
                className={`bet-button ${isAutoBetting ? 'stop' : ''}`}
                onClick={handleBetClick}
                disabled={isDropBallDisabled}
            >
                {betMode === 'manual' ? t('plinko.drop') : isAutoBetting ? t('games.stopAutoBet') : t('games.startAutoBet')}
            </button>

            {/* Footer */}
            <div className="sidebar-footer mobile-sheet-secondary">
                <div className="footer-buttons">
                    <button
                        className={`footer-btn ${isStatsOpen ? 'active' : ''}`}
                        onClick={onStatsClick}
                        title={t('plinko.liveStats')}
                        aria-label={t('plinko.liveStats')}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 11.78l4.24-7.33 1.73 1-5.23 9.05-6.51-3.75L5.46 19H22v2H2V3h2v14.54L9.5 8z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* --- Plinko extra: Ball Selector, Last Win, Streak --- */}
            {Object.keys(ballTypes || {}).length > 1 && (
                <div className="ball-selector-card sidebar-card mobile-sheet-secondary">
                    <div className="ball-selector-header">
                        <StarOutlined />
                        <span>{t('plinko.ballType')}</span>
                    </div>
                    <div className="ball-types-grid">
                        {Object.values(ballTypes || {}).map(ball => (
                            <Tooltip
                                key={ball.id}
                                title={
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{t(`plinko.balls.${ball.id}`)}</div>
                                        <div>{ball.multiplierBonus > 1 ? t('plinko.ballBonus', { factor: ball.multiplierBonus }) : t('plinko.ballBase')}</div>
                                        <div style={{ color: 'var(--text-secondary)' }}>{t('plinko.ballCost', { cost: ball.cost })}</div>
                                    </div>
                                }
                            >
                                <div
                                    className={`ball-type-option ${selectedBallType === ball.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedBallType?.(ball.id)}
                                    style={{ '--ball-color': ball.color }}
                                >
                                    <div
                                        className="ball-color-circle"
                                        style={{ backgroundImage: `url(${ball.image})`, backgroundSize: 'cover', backgroundColor: 'transparent' }}
                                    ></div>
                                    <div className="ball-type-content">
                                        <div className="ball-type-name">{t(`plinko.balls.${ball.id}`)}</div>
                                        <div className="ball-type-cost">{ball.cost}×</div>
                                    </div>
                                </div>
                            </Tooltip>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Sidebar;
