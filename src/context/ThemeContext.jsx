import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
    applyPaletteCssVars,
    DEFAULT_PALETTE_ID,
    getAntdTheme,
    getPalette,
    isPaletteId,
    LEGACY_PALETTE_STORAGE_KEY,
    PALETTES,
    PALETTE_STORAGE_KEY,
} from '../theme/palettes'

const ThemeContext = createContext(null)

function getStoredPaletteId() {
    try {
        const stored = localStorage.getItem(PALETTE_STORAGE_KEY)
        if (isPaletteId(stored)) return stored
        // Keep a theme chosen in the previous version; the retired old-brand palette falls back to the default.
        const legacy = localStorage.getItem(LEGACY_PALETTE_STORAGE_KEY)
        if (isPaletteId(legacy)) return legacy
    } catch { /* storage blocked */ }
    return DEFAULT_PALETTE_ID
}

export function ThemeProvider({ children }) {
    const [paletteId, setPaletteIdState] = useState(getStoredPaletteId)
    const palette = useMemo(() => getPalette(paletteId), [paletteId])
    const antdTheme = useMemo(() => getAntdTheme(palette), [palette])

    useEffect(() => {
        applyPaletteCssVars(palette)
    }, [palette])

    const setPaletteId = (nextPaletteId) => {
        if (!isPaletteId(nextPaletteId)) return
        try {
            localStorage.setItem(PALETTE_STORAGE_KEY, nextPaletteId)
            localStorage.removeItem(LEGACY_PALETTE_STORAGE_KEY)
        } catch { /* storage blocked */ }
        setPaletteIdState(nextPaletteId)
    }

    return (
        <ThemeContext.Provider value={{ paletteId, palettes: PALETTES, setPaletteId, antdTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useThemeSettings() {
    const context = useContext(ThemeContext)
    if (!context) throw new Error('useThemeSettings must be used within ThemeProvider')
    return context
}
