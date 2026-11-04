import { theme } from 'antd'

export const DEFAULT_PALETTE_ID = '123bet'
export const PALETTE_STORAGE_KEY = '123bet_theme_v1'
export const LEGACY_PALETTE_STORAGE_KEY = 'stake_palette_preset'

// Brand palette: graphite/deep-blue base with a vibrant green accent (see src/styles/tokens.css).
const brand = {
    id: '123bet',
    tokens: {
        bgApp: '#0a0f17', bgHeader: '#0c121c', bgSidebar: '#0e1520', bgMain: '#111a26',
        surface1: '#151f2d', surface2: '#1a2738', surface3: '#223246', surfaceHover: '#2a3d55',
        borderSubtle: '#223146', borderDefault: '#2c3f57', borderStrong: '#3b5372',
        textPrimary: '#f3f7fb', textSecondary: '#a9b7c7', textMuted: '#74869b', textDisabled: '#4a5a6d',
        primary: '#1fd67a', primaryHover: '#47e594', primaryActive: '#16b866', primarySoft: 'rgba(31, 214, 122, 0.14)', onPrimary: '#04140b',
        cyan: '#3cc8ff', cyanSoft: 'rgba(60, 200, 255, 0.14)', heroOverlay: '#060a10', heroAccent: '#5ef0a4',
        accentWarm: '#ffb547', accentWarmHover: '#ffc876', accentOrange: '#ff8a3d',
        success: '#1fd67a', successSoft: 'rgba(31, 214, 122, 0.14)', danger: '#ff5468', dangerSoft: 'rgba(255, 84, 104, 0.14)',
        accentBlue: '#3c8dff', accentGreen: '#1fd67a', accentGreenHover: '#16b866', accentYellow: '#ffb547', accentRed: '#ff5468', accentPurple: '#8b7bff',
    },
}

const arcadeBlue = {
    id: 'arcade-blue',
    tokens: {
        bgApp: '#071426', bgHeader: '#09192b', bgSidebar: '#0b1b2e', bgMain: '#10243a',
        surface1: '#132a43', surface2: '#183451', surface3: '#1e3e5f', surfaceHover: '#234a70',
        borderSubtle: '#294763', borderDefault: '#335a78', borderStrong: '#43789b',
        textPrimary: '#f7fbff', textSecondary: '#b7c9d9', textMuted: '#7f9aaf', textDisabled: '#526b7d',
        primary: '#2f8cff', primaryHover: '#57a5ff', primaryActive: '#1e6fd6', primarySoft: 'rgba(47, 140, 255, 0.14)', onPrimary: '#ffffff',
        cyan: '#30d5ff', cyanSoft: 'rgba(48, 213, 255, 0.14)', heroOverlay: '#031029', heroAccent: '#58b9ff',
        accentWarm: '#ffb21c', accentWarmHover: '#ffc54a', accentOrange: '#ff7a1a',
        success: '#35d06f', successSoft: 'rgba(53, 208, 111, 0.14)', danger: '#ff4d5f', dangerSoft: 'rgba(255, 77, 95, 0.14)',
        accentBlue: '#2f8cff', accentGreen: '#35d06f', accentGreenHover: '#26ad58', accentYellow: '#ffb21c', accentRed: '#ff4d5f', accentPurple: '#608dff',
    },
}

const midnightPurple = {
    id: 'midnight-purple',
    tokens: {
        bgApp: '#120b22', bgHeader: '#160d2b', bgSidebar: '#1b1033', bgMain: '#21133f',
        surface1: '#28184b', surface2: '#34205f', surface3: '#432a78', surfaceHover: '#4c3188',
        borderSubtle: '#4a3670', borderDefault: '#5b4386', borderStrong: '#7255a7',
        textPrimary: '#fbf8ff', textSecondary: '#d2c4ea', textMuted: '#9887b8', textDisabled: '#655678',
        primary: '#9b5cff', primaryHover: '#b17cff', primaryActive: '#7d3de0', primarySoft: 'rgba(155, 92, 255, 0.16)', onPrimary: '#ffffff',
        cyan: '#35d7ff', cyanSoft: 'rgba(53, 215, 255, 0.14)', heroOverlay: '#0c061a', heroAccent: '#c69bff',
        accentWarm: '#ffbf47', accentWarmHover: '#ffd37a', accentOrange: '#ff8a3d',
        success: '#3ee68a', successSoft: 'rgba(62, 230, 138, 0.14)', danger: '#ff5d7a', dangerSoft: 'rgba(255, 93, 122, 0.14)',
        accentBlue: '#6f8cff', accentGreen: '#3ee68a', accentGreenHover: '#2fc06f', accentYellow: '#ffbf47', accentRed: '#ff5d7a', accentPurple: '#b17cff',
    },
}

const emberGold = {
    id: 'ember-gold',
    tokens: {
        bgApp: '#17100b', bgHeader: '#1d130c', bgSidebar: '#21160d', bgMain: '#2a1b10',
        surface1: '#342213', surface2: '#432c18', surface3: '#56381e', surfaceHover: '#654322',
        borderSubtle: '#5a4027', borderDefault: '#735333', borderStrong: '#916940',
        textPrimary: '#fffaf2', textSecondary: '#e5c9a3', textMuted: '#a8865f', textDisabled: '#6f563c',
        primary: '#f7b731', primaryHover: '#ffca5a', primaryActive: '#c88912', primarySoft: 'rgba(247, 183, 49, 0.16)', onPrimary: '#1a1206',
        cyan: '#ff8f3d', cyanSoft: 'rgba(255, 143, 61, 0.14)', heroOverlay: '#100905', heroAccent: '#ffd27a',
        accentWarm: '#ff8f3d', accentWarmHover: '#ffab69', accentOrange: '#ff6b2c',
        success: '#4ade80', successSoft: 'rgba(74, 222, 128, 0.14)', danger: '#ff5c5c', dangerSoft: 'rgba(255, 92, 92, 0.14)',
        accentBlue: '#4fa3ff', accentGreen: '#4ade80', accentGreenHover: '#22c55e', accentYellow: '#f7b731', accentRed: '#ff5c5c', accentPurple: '#c084fc',
    },
}

// Display names come from i18n: t(`settings.themeNames.${palette.id}`).
export const PALETTES = [brand, arcadeBlue, midnightPurple, emberGold]

export function isPaletteId(id) {
    return PALETTES.some((palette) => palette.id === id)
}

export function getPalette(id) {
    return PALETTES.find((palette) => palette.id === id) || brand
}

export function applyPaletteCssVars(palette) {
    const { tokens } = palette
    const variables = {
        '--bg-app': tokens.bgApp, '--bg-header': tokens.bgHeader, '--bg-sidebar': tokens.bgSidebar, '--bg-main': tokens.bgMain,
        '--surface-1': tokens.surface1, '--surface-2': tokens.surface2, '--surface-3': tokens.surface3, '--surface-hover': tokens.surfaceHover,
        '--border-subtle': tokens.borderSubtle, '--border-default': tokens.borderDefault, '--border-strong': tokens.borderStrong,
        '--text-primary': tokens.textPrimary, '--text-secondary': tokens.textSecondary, '--text-muted': tokens.textMuted, '--text-disabled': tokens.textDisabled,
        '--primary': tokens.primary, '--primary-hover': tokens.primaryHover, '--primary-active': tokens.primaryActive, '--primary-soft': tokens.primarySoft,
        '--on-primary': tokens.onPrimary,
        '--cyan': tokens.cyan, '--cyan-soft': tokens.cyanSoft, '--hero-overlay': tokens.heroOverlay, '--hero-accent': tokens.heroAccent,
        '--accent-warm': tokens.accentWarm, '--accent-warm-hover': tokens.accentWarmHover, '--accent-orange': tokens.accentOrange,
        '--success': tokens.success, '--success-soft': tokens.successSoft, '--danger': tokens.danger, '--danger-soft': tokens.dangerSoft,
        '--accent-blue': tokens.accentBlue, '--accent-green': tokens.accentGreen, '--accent-green-hover': tokens.accentGreenHover,
        '--accent-yellow': tokens.accentYellow, '--accent-red': tokens.accentRed, '--accent-purple': tokens.accentPurple,
        '--bg-primary': tokens.bgMain, '--bg-secondary': tokens.bgSidebar, '--bg-tertiary': tokens.surface2, '--bg-input': tokens.surface1,
        '--border-color': tokens.borderSubtle,
    }

    Object.entries(variables).forEach(([name, value]) => document.documentElement.style.setProperty(name, value))
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.bgHeader)
}

export function getAntdTheme(palette) {
    const { tokens } = palette

    return {
        algorithm: theme.darkAlgorithm,
        token: {
            colorPrimary: tokens.primary,
            colorTextLightSolid: tokens.onPrimary,
            colorBgBase: tokens.bgApp,
            colorBgContainer: tokens.surface1,
            colorBgElevated: tokens.surface2,
            colorBorder: tokens.borderSubtle,
            colorText: tokens.textPrimary,
            colorTextSecondary: tokens.textSecondary,
            colorSuccess: tokens.success,
            colorWarning: tokens.accentWarm,
            colorError: tokens.danger,
            colorInfo: tokens.cyan,
            borderRadius: 10,
            fontFamily: "'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        components: {
            Button: { primaryColor: tokens.onPrimary, colorPrimaryHover: tokens.primaryHover },
            Input: { colorBgContainer: tokens.surface1, colorBorder: tokens.borderSubtle, activeBorderColor: tokens.primary },
            InputNumber: { colorBgContainer: tokens.surface1, colorBorder: tokens.borderSubtle },
            Tabs: { colorBgContainer: tokens.surface1, itemSelectedColor: tokens.textPrimary, itemColor: tokens.textSecondary },
            Card: { colorBgContainer: tokens.surface1, colorBorderSecondary: tokens.borderSubtle },
            Slider: { colorPrimaryBorderHover: tokens.primaryHover, handleColor: tokens.primary, trackBg: tokens.primary, trackHoverBg: tokens.primaryHover },
            Tooltip: { colorBgSpotlight: tokens.surface2 },
            Drawer: { colorBgElevated: tokens.bgSidebar },
            Modal: { contentBg: tokens.surface1, headerBg: tokens.surface1 },
        },
    }
}
