import { useId } from 'react'
import { formatCoins } from '../i18n/format'
import './brand.css'

// 123bet mark: green tile with three rising bars (1, 2, 3). Same geometry as public/favicon.svg.
export function BrandMark({ size = 28 }) {
    const gradient = useId()
    return (
        <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#3ff09a" />
                    <stop offset="1" stopColor="#12b866" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill={`url(#${gradient})`} />
            <rect x="7" y="17" width="4.5" height="8" rx="1.6" fill="#04140b" />
            <rect x="13.75" y="12" width="4.5" height="13" rx="1.6" fill="#04140b" />
            <rect x="20.5" y="7" width="4.5" height="18" rx="1.6" fill="#04140b" />
        </svg>
    )
}

export function Logo({ compact = false, size = 28 }) {
    return (
        <span className="brand-logo" role="img" aria-label="123bet">
            <BrandMark size={size} />
            {!compact && (
                <span className="brand-logo__word" aria-hidden="true">
                    <span className="brand-logo__num">123</span>bet
                </span>
            )}
        </span>
    )
}

// 123 Coins: fictional credits. Amber token with the brand bars, deliberately unlike any currency sign.
export function CoinIcon({ size = 16 }) {
    const gradient = useId()
    return (
        <svg className="coin-icon" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#ffd772" />
                    <stop offset="1" stopColor="#f2a516" />
                </linearGradient>
            </defs>
            <circle cx="10" cy="10" r="9.25" fill={`url(#${gradient})`} stroke="#b97808" strokeWidth="1" />
            <rect x="5.6" y="10.6" width="2.2" height="4" rx="0.8" fill="#3b2402" />
            <rect x="8.9" y="8.1" width="2.2" height="6.5" rx="0.8" fill="#3b2402" />
            <rect x="12.2" y="5.6" width="2.2" height="9" rx="0.8" fill="#3b2402" />
        </svg>
    )
}

// Amount in 123 Coins, e.g. <Coins value={1234.5} /> → [coin] 1.234,50 (screen readers: "1.234,50 123 Coins").
export function Coins({ value, size = 16, className = '' }) {
    const text = formatCoins(value)
    return (
        <span className={`coins ${className}`.trim()} aria-label={`${text} 123 Coins`}>
            <CoinIcon size={size} />
            <span aria-hidden="true">{text}</span>
        </span>
    )
}
