import { useState } from 'react'
import { Tag, Button, Drawer, List, Space, Typography } from 'antd'
import { HistoryOutlined, RightOutlined } from '@ant-design/icons'
import { t } from '../../i18n'
import { formatMultiplier } from '../../i18n/format'

const { Text } = Typography

function GameHistory({ history }) {
    const [drawerOpen, setDrawerOpen] = useState(false)

    const getCategory = (multiplier) => {
        if (multiplier < 2) return { color: 'default', className: 'low' }
        if (multiplier < 10) return { color: 'green', className: 'medium' }
        if (multiplier < 100) return { color: 'lime', className: 'high' }
        return { color: 'purple', className: 'mega' }
    }

    return (
        <>
            <div className="game-history-bar">
                {/* History Pills - show all available */}
                <div className="history-pills-scroll">
                    {history.map((m, i) => {
                        const { color, className } = getCategory(m)
                        return (
                            <Tag
                                key={i}
                                color={color}
                                className={`history-tag ${className}`}
                            >
                                {formatMultiplier(m)}
                            </Tag>
                        )
                    })}
                </div>

                {/* View All Button */}
                <Button
                    type="text"
                    className="view-all-btn"
                    onClick={() => setDrawerOpen(true)}
                    aria-label={t('crash.gameHistory')}
                    icon={<RightOutlined />}
                />
            </div>

            {/* History Drawer */}
            <Drawer
                title={
                    <Space>
                        <HistoryOutlined />
                        <span>{t('crash.gameHistory')}</span>
                    </Space>
                }
                placement="right"
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                width={320}
                rootClassName="crash-history-drawer-portal mobile-game-modal"
                styles={{
                    header: { background: '#1a2c38', borderBottom: '1px solid #2f4553' },
                    body: { background: '#0f212e', padding: 0 },
                }}
            >
                <List
                    dataSource={history}
                    renderItem={(item, index) => {
                        const { color, className } = getCategory(item)
                        return (
                            <List.Item
                                className="history-list-item"
                                style={{
                                    padding: '12px 16px',
                                    borderBottom: '1px solid #2f4553'
                                }}
                            >
                                <Space>
                                    <Text type="secondary">#{index + 1}</Text>
                                    <Tag color={color} className={className}>
                                        {formatMultiplier(item)}
                                    </Tag>
                                </Space>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {index === 0 ? t('crash.justNow') : t('crash.secondsAgo', { n: index * 15 })}
                                </Text>
                            </List.Item>
                        )
                    }}
                />
            </Drawer>
        </>
    )
}

export default GameHistory
