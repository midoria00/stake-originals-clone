import { Dices, Gem, Rocket, TrendingUp, Triangle } from 'lucide-react'

// Lucide has no football or dinosaur, so those two are drawn here in the same 24px stroke style.
export function FootballIcon({ size = 20, ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
            <circle cx="12" cy="12" r="10" />
            <path d="m12 7 4 3-1.5 5h-5L8 10z" />
            <path d="M12 7V2.5M16 10l4.5-1.5M14.5 15l2.5 4M9.5 15 7 19M8 10 3.5 8.5" />
        </svg>
    )
}

export function DinoIcon({ size = 20, ...props }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
            <path d="M13 3h6a2 2 0 0 1 2 2v3h-6v3l-3 2v4l-2 4H8l1-4-3-2-3 1V10l3 1 3-2h4V5a2 2 0 0 1 2-2" />
            <path d="M17 5.5h.01" />
        </svg>
    )
}

const GAME_ICONS = { crash: Rocket, plinko: Triangle, mines: Gem, dino: DinoIcon, dice: Dices, limbo: TrendingUp }

export function GameIcon({ id, size = 20 }) {
    const Icon = GAME_ICONS[id] ?? Dices
    return <Icon size={size} aria-hidden="true" />
}
