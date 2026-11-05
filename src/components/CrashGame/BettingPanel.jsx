import { useState, useEffect } from 'react'
import {
    InputNumber,
    Button,
    Typography,
    Switch,
    Tooltip,
    Slider
} from 'antd'
import {
    ThunderboltOutlined,
    QuestionCircleOutlined
} from '@ant-design/icons'
import { Coins, CoinIcon } from '../../brand/Brand'
import { t } from '../../i18n'
import { truncateMultiplier } from '../../i18n/format'

const { Text } = Typography

function BettingPanel({ phase, betPlaced, multiplier, onBet, onCashout, serverMode = false }) {
    const [betAmount, setBetAmount] = useState(1)
    const [cashoutAt, setCashoutAt] = useState(2.00)
    const [autoCashout, setAutoCashout] = useState(true)

    // Calculate profit
    const profit = betAmount * (cashoutAt - 1)

    // Auto Cashout Logic (visitors only: a server round carries its own autoCashout)
    useEffect(() => {
        if (!serverMode && phase === 'running' && betPlaced && autoCashout) {
            if (multiplier >= cashoutAt) {
                onCashout()
            }
        }
    }, [multiplier, phase, betPlaced, autoCashout, cashoutAt, onCashout, serverMode])

    const handleBetClick = () => {
        if (phase === 'waiting') {
            if (betAmount > 0) {
                onBet(betAmount, autoCashout ? cashoutAt : null)
            }
        } else if (phase === 'running' && betPlaced) {
            onCashout()
        }
    }

    const getButtonText = () => {
        if (phase === 'waiting') {
            return betPlaced ? t('crash.cancelBet') : t('games.placeBet')
        }
        if (phase === 'running' && betPlaced) {
            return <>{t('games.cashOut')} <Coins value={betAmount * truncateMultiplier(multiplier)} size={14} /></>
        }
        return t('games.placeBet')
    }

    const getButtonClass = () => {
        if (phase === 'running' && betPlaced) return 'bet-button cashout-btn'
        return 'bet-button'
    }

    return (
        <div className="betting-panel-3d">
            {/* Only manual betting exists; the auto-bet tab was a placeholder and was removed. */}
            <div className="bet-form">
                    {/* Bet Amount */}
                    <div className="form-group">
                        <div className="form-header">
                            <label className="form-label" style={{ margin: 0 }}>{t('games.betAmount')}</label>
                            <Text type="secondary" style={{ margin: 0 }}><Coins value={betAmount || 0} size={14} /></Text>
                        </div>
                        <div className="input-row">
                            <InputNumber
                                value={betAmount}
                                onChange={setBetAmount}
                                min={0}
                                step={1}
                                addonBefore={<CoinIcon size={20} />}
                                aria-label={t('games.betAmount')}
                                controls={false}
                                formatter={(v) => `${v}`}
                                parser={(v) => v.replace(/\$\s?|(,*)/g, '')}
                            />
                            <Button.Group>
                                <Button aria-label={t('games.half')} onClick={() => setBetAmount(prev => Math.max(0, prev / 2))}>½</Button>
                                <Button aria-label={t('games.double')} onClick={() => setBetAmount(prev => prev * 2)}>2×</Button>
                            </Button.Group>
                        </div>
                    </div>

                    {/* Cashout At */}
                    <div className="form-group mobile-sheet-secondary">
                        <div className="form-header">
                            <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                                {t('crash.autoCashout')}
                                <Tooltip title={t('crash.autoCashoutHint')}>
                                    <QuestionCircleOutlined style={{ marginLeft: 6, cursor: 'pointer', color: '#b1b6c6' }} />
                                </Tooltip>
                            </label>
                            <Switch
                                size="small"
                                checked={autoCashout}
                                aria-label={t('crash.autoCashout')}
                                onChange={setAutoCashout}
                                className="crash-switch"
                            />
                        </div>
                        <InputNumber
                            value={cashoutAt}
                            onChange={setCashoutAt}
                            min={1.01}
                            max={1000}
                            step={0.1}
                            precision={2}
                            disabled={!autoCashout}
                            aria-label={t('crash.autoCashout')}
                            style={{ width: '100%' }}
                            addonAfter={<span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>×</span>}
                        />
                    </div>

                    {/* Profit Display - 3D Card Style */}
                    <div className="profit-card-3d mobile-sheet-secondary">
                        <div className="form-header" style={{ marginBottom: 4 }}>
                            <label className="form-label" style={{ margin: 0 }}>{t('games.profitOnWin')}</label>
                            <Text type="secondary" style={{ margin: 0 }}><Coins value={profit} size={14} /></Text>
                        </div>
                        <Text strong style={{ color: 'var(--success)', fontSize: 16, fontFamily: "'Courier New', monospace" }}>
                            +<Coins value={profit} size={14} />
                        </Text>
                    </div>

                    {/* Bet Button */}
                    <button
                        onClick={handleBetClick}
                        className={getButtonClass()}
                        disabled={phase === 'running' && !betPlaced}
                    >
                        <ThunderboltOutlined style={{ marginRight: 6 }} />
                        {getButtonText()}
                    </button>
            </div>
        </div>
    )
}

export default BettingPanel

