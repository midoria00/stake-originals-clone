import { useState, useEffect, useRef } from 'react'
import { Card, Typography, Space, Badge, Collapse, Avatar } from 'antd'
import { UserOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons'
import { CoinIcon } from '../../brand/Brand'
import { t } from '../../i18n'
import { formatCoins, formatMultiplier, formatNumber } from '../../i18n/format'

const { Text } = Typography

// Mock player data
const generatePlayers = () => {
    const names = [
        'Hidden', 'philly5066', 'Riyad6999', 'BA777', 'Naeem1314',
        'EnvyAdam', 'CryptoKing', 'LuckyDraw', 'MaxBet', 'HighRoller',
        'ShadowBet', 'GoldRush', 'DiamondH', 'AcePlayer', 'BetMaster'
    ]

    return names.map((name, i) => ({
        id: i,
        name: name === 'Hidden' ? 'Hidden' : name,
        isHidden: name === 'Hidden' || Math.random() > 0.6,
        betAmount: (Math.random() * 500 + 0.001).toFixed(2),
        cashoutAt: Math.random() > 0.5 ? (Math.random() * 3 + 1).toFixed(2) : null,
        profit: null
    }))
}

function PlayerBets({ multiplier, phase, onPlayerCashout, userBetData }) {
    const [players, setPlayers] = useState(generatePlayers())
    const [expanded, setExpanded] = useState(true)
    const [totalBet, setTotalBet] = useState(2913.90)
    const [playerCount, setPlayerCount] = useState(383)
    const lastCashoutCheckRef = useRef(0)

    // Update players when game phase changes
    useEffect(() => {
        if (phase === 'waiting') {
            setPlayers(generatePlayers())
            setPlayerCount(300 + Math.floor(Math.random() * 150))
            setTotalBet(1500 + Math.random() * 2000)
        }
    }, [phase])

    // OPTIMIZED: Check for cashouts every 200ms instead of every frame
    useEffect(() => {
        if (phase === 'running') {
            const now = Date.now()
            if (now - lastCashoutCheckRef.current < 200) return
            lastCashoutCheckRef.current = now

            setPlayers(prev => {
                let changed = false
                const updated = prev.map(player => {
                    if (player.cashoutAt && parseFloat(player.cashoutAt) <= multiplier && !player.profit) {
                        changed = true
                        const profit = player.betAmount * parseFloat(player.cashoutAt)
                        if (onPlayerCashout && !player.isHidden) {
                            onPlayerCashout({
                                name: player.name,
                                amount: profit.toFixed(2),
                                multiplier: player.cashoutAt
                            })
                        }
                        return { ...player, profit: profit.toFixed(2) }
                    }
                    return player
                })
                // Only return new array if something actually changed
                return changed ? updated : prev
            })
        }
    }, [multiplier, phase, onPlayerCashout])

    return (
        <div className="player-bets-panel">
            {/* Generated activity: always labelled as simulated */}
            <div className="player-bets-simulated" style={{ padding: '8px 12px 0' }}>
                <Text strong style={{ fontSize: 12 }}>{t('crash.simulated')}</Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{t('crash.simulatedNote')}</Text>
            </div>
            {/* Header */}
            <div
                className="player-bets-header"
                onClick={() => setExpanded(!expanded)}
            >
                <Space>
                    <Badge status="processing" color="var(--success)" />
                    <UserOutlined />
                    <Text strong>{formatNumber(playerCount + (userBetData ? 1 : 0))}</Text>
                </Space>
                <Space>
                    <CoinIcon size={16} />
                    <Text strong>{formatCoins(totalBet + (userBetData?.amount || 0))}</Text>
                    {expanded ? <CaretUpOutlined /> : <CaretDownOutlined />}
                </Space>
            </div>

            {/* Player List */}
            {expanded && (
                <div className="player-bets-list">
                    {(userBetData ? [userBetData, ...players] : players).slice(0, 10).map((player, i) => (
                        <div key={i} className={`player-bet-row ${player.profit ? 'cashed-out' : ''}`}>
                            <div className="player-info">
                                {player.isHidden ? (
                                    <Text type="secondary" className="hidden-name">
                                        <UserOutlined /> {t('crash.hidden')}
                                    </Text>
                                ) : (
                                    <Text className="player-name">{player.name}</Text>
                                )}
                                {player.cashoutAt && player.profit && (
                                    <Text className="cashout-mult" type="success">
                                        {formatMultiplier(player.cashoutAt)}
                                    </Text>
                                )}
                                {player.cashoutAt && !player.profit && (
                                    <Text className="cashout-mult" type="secondary">
                                        -
                                    </Text>
                                )}
                            </div>
                            <div className="bet-amount">
                                <CoinIcon size={14} />
                                <Text className={player.profit ? 'profit' : ''}>
                                    {formatCoins(player.profit || (typeof player.amount === 'number' ? player.amount : player.betAmount))}
                                </Text>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default PlayerBets
