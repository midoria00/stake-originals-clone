import { useState, useEffect } from 'react'
import { Typography, Tag } from 'antd'
import { CoinIcon } from '../../brand/Brand'
import { t } from '../../i18n'
import { formatCoins } from '../../i18n/format'

const { Text } = Typography

function PlayerResults({ cashouts }) {
    const [visibleCashouts, setVisibleCashouts] = useState([])

    // Add new cashouts and remove old ones
    useEffect(() => {
        if (cashouts.length > 0) {
            const latest = cashouts[cashouts.length - 1]
            const newCashout = {
                ...latest,
                id: Date.now(),
                visible: true
            }

            setVisibleCashouts(prev => [...prev, newCashout].slice(-5))

            // Auto-remove after 10 seconds (longer for better visibility)
            setTimeout(() => {
                setVisibleCashouts(prev =>
                    prev.filter(c => c.id !== newCashout.id)
                )
            }, 10000)
        }
    }, [cashouts.length])

    if (visibleCashouts.length === 0) return null

    return (
        <div className="player-results">
            {visibleCashouts.map((cashout, index) => (
                <div
                    key={cashout.id}
                    className="player-result-item"
                    style={{
                        animationDelay: `${index * 0.1}s`,
                        top: `${80 + index * 45}px`
                    }}
                >
                    <Text className="result-name">{cashout.name}</Text>
                    <CoinIcon size={16} />
                    <Text className="result-amount" style={{ color: 'var(--success)' }}>
                        {formatCoins(cashout.amount)}
                    </Text>
                    <Tag style={{ margin: 0 }} title={t('crash.simulatedNote')}>{t('crash.simulatedShort')}</Tag>
                </div>
            ))}
        </div>
    )
}

export default PlayerResults
