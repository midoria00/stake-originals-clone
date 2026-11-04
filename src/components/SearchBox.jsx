import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { GAMES } from '../games'
import { t } from '../i18n'
import { FootballIcon, GameIcon } from './icons'

const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Combobox: games match locally as you type; any text can also search teams in the football list.
export default function SearchBox({ onDone, autoFocus = false }) {
    const navigate = useNavigate()
    const [text, setText] = useState('')
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(0)
    const listId = useId()
    const rootRef = useRef(null)

    useEffect(() => {
        const timer = setTimeout(() => setQuery(text), 120)
        return () => clearTimeout(timer)
    }, [text])

    useEffect(() => {
        const close = (event) => rootRef.current && !rootRef.current.contains(event.target) && setOpen(false)
        document.addEventListener('pointerdown', close)
        return () => document.removeEventListener('pointerdown', close)
    }, [])

    const options = useMemo(() => {
        const q = normalize(query)
        if (!q) return []
        const games = GAMES.filter((game) => normalize(`${game.name} ${game.navLabel}`).includes(q))
            .map((game) => ({ id: game.id, label: game.navLabel, to: game.path, kind: 'game' }))
        return [...games, { id: 'teams', label: t('home.searchTeams', { query: query.trim() }), to: `/sports?q=${encodeURIComponent(query.trim())}`, kind: 'teams' }]
    }, [query])

    const go = (option) => {
        if (!option) return
        navigate(option.to)
        setText('')
        setOpen(false)
        onDone?.()
    }

    const onKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, options.length - 1))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
        } else if (event.key === 'Enter') {
            event.preventDefault()
            go(options[active] ?? options[0])
        } else if (event.key === 'Escape') {
            setOpen(false)
        }
    }

    const expanded = open && options.length > 0
    return (
        <div className="search-box" ref={rootRef}>
            <Search size={16} className="search-box__icon" aria-hidden="true" />
            <input
                type="search"
                role="combobox"
                aria-label={t('common.search')}
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                placeholder={t('common.searchPlaceholder')}
                value={text}
                autoFocus={autoFocus}
                maxLength={60}
                onChange={(event) => {
                    setText(event.target.value)
                    setActive(0)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
            />
            {expanded && (
                <ul className="search-box__list" id={listId} role="listbox">
                    {options.map((option, index) => (
                        <li
                            key={option.id}
                            id={`${listId}-${index}`}
                            role="option"
                            aria-selected={index === active}
                            className={index === active ? 'is-active' : ''}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => go(option)}
                        >
                            {option.kind === 'game' ? <GameIcon id={option.id} size={16} /> : <FootballIcon size={16} />}
                            <span>{option.label}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
