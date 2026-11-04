import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function source(relativePath) {
    return readFile(new URL(relativePath, import.meta.url), 'utf8').catch(() => '')
}

async function sources(relativePaths) {
    return Promise.all(relativePaths.map(source))
}

test('mobile shell exposes drawer, compact header, and five-item bottom navigation', async () => {
    const [app, layout, header, navigation, navigationCss, layoutCss] = await sources([
        './src/App.jsx',
        './src/components/Layout.jsx',
        './src/components/Header.jsx',
        './src/components/MobileNavigation.jsx',
        './src/components/MobileNavigation.css',
        './src/styles/layout.css',
    ])

    assert.match(app, /role="status"/)
    assert.doesNotMatch(app, /fallback=\{null\}/)
    assert.match(layout, /<MobileNavigation/)
    assert.match(layout, /<main id="main"/)
    assert.match(header, /aria-label=\{t\('nav\.openMenu'\)\}/)
    assert.match(header, /ref=\{menuButtonRef\}/)
    assert.match(header, /aria-expanded=\{menuOpen\}/)
    assert.match(navigation, /afterOpenChange=/)
    // One wallet control in the header, with a single disclosure panel.
    assert.equal((header.match(/className="wallet-menu__panel"/g) || []).length, 1)
    assert.match(header, /aria-expanded=\{open\}/)
    // Início, Cassino, Esportes, Bilhete (opens the slip) and Carteira.
    assert.match(navigation, /aria-label=\{t\('nav\.primary'\)\}/)
    assert.match(navigation, /const primaryRoutes = \[/)
    for (const route of ["path: '/'", "path: '/cassino'", "path: '/sports'"]) assert.ok(navigation.includes(route), route)
    assert.match(navigation, /onClick=\{onOpenSlip\}/)
    assert.match(navigation, /to="\/carteira"/)
    assert.match(navigationCss, /repeat\(5,/)
    assert.match(navigationCss, /safe-area-inset-bottom/)
    assert.match(layoutCss, /height:\s*100dvh/)
    assert.match(layoutCss, /padding-bottom:\s*var\(--mobile-nav-space\)/)
})

test('Home uses a fluid hero and adaptive game grid', async () => {
    const [home, cards] = await sources(['./src/styles/home.css', './src/components/GameCard.css'])
    assert.match(home, /\.home-hero h1\s*\{[^}]*font-size:\s*clamp\(/s)
    assert.match(home, /@media\s*\(max-width:\s*768px\)/)
    assert.match(cards, /\.game-grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(/s)
    assert.match(cards, /@media\s*\(max-width:\s*480px\)[\s\S]*grid-template-columns:\s*repeat\(2,/)
    assert.match(cards, /prefers-reduced-motion/)
})

test('Mines keeps the square board ahead of a collapsible betting sheet', async () => {
    const [component, css] = await sources([
        './src/components/MinesGame/MinesGame.jsx',
        './src/components/MinesGame/MinesGame.css',
    ])
    assert.match(component, /<MobileBetSheet[^>]*title="Mines bet controls"/)
    assert.match(component, /mines-bet-sheet/)
    assert.match(component, /mobile-sheet-secondary/)
    assert.match(component, /rootClassName="mines-fairness-modal-portal mobile-game-modal"/)
    assert.match(component, /rootClassName="mines-history-modal-portal mobile-game-modal"/)
    assert.match(css, /\.mines-display\s*\{[^}]*aspect-ratio:\s*1/s)
    assert.match(css, /\.mines-bet-sheet\[data-state='collapsed'\]/)
    assert.match(css, /@media\s*\(max-width:\s*768px\)/)
})

test('Crash prioritizes chart, cashout, and mobile player tabs', async () => {
    const [game, panel, history, css] = await sources([
        './src/components/CrashGame/CrashGame.jsx',
        './src/components/CrashGame/BettingPanel.jsx',
        './src/components/CrashGame/GameHistory.jsx',
        './src/components/CrashGame/CrashGame.css',
    ])
    assert.match(game, /<MobileBetSheet[^>]*title="Crash bet controls"/)
    assert.match(game, /mobileDataTab/)
    assert.match(game, /crash-mobile-tabs/)
    assert.match(game, /showPlayerBets && mobileDataTab === 'bets'/)
    assert.match(panel, /mobile-sheet-secondary/)
    assert.match(history, /crash-history-drawer-portal mobile-game-modal/)
    assert.match(css, /\.game-history-bar[\s\S]*overflow-x:\s*auto/)
    assert.match(css, /\.crash-mobile-tabs/)
})

test('Dino keeps Phaser and live actions ahead of secondary controls', async () => {
    const [component, css] = await sources([
        './src/components/DinoGame/DinoGame.jsx',
        './src/components/DinoGame/DinoGame.css',
    ])
    assert.match(component, /<MobileBetSheet[^>]*title="Dino bet controls"/)
    assert.match(component, /collapseOn=\{gamePhase === 'running' \|\| gamePhase === 'waiting'\}/)
    assert.match(component, /dino-bet-sheet/)
    assert.match(component, /mobile-sheet-secondary/)
    assert.match(css, /\.phaser-container\s*\{[^}]*aspect-ratio:/s)
    assert.match(css, /orientation:\s*landscape/)
})

test('Plinko mobile presentation preserves board ratio and critical controls', async () => {
    const [game, sidebar, board, gameCss, sidebarCss, boardCss] = await sources([
        './src/components/PlinkoGame/PlinkoGame.jsx',
        './src/components/PlinkoGame/Sidebar.jsx',
        './src/components/PlinkoGame/Plinko.jsx',
        './src/components/PlinkoGame/PlinkoGame.css',
        './src/components/PlinkoGame/Sidebar.css',
        './src/components/PlinkoGame/Plinko.css',
    ])
    assert.match(game, /<MobileBetSheet[^>]*title="Plinko bet controls"/)
    assert.match(game, /plinko-bet-sheet/)
    assert.match(sidebar, /mobile-sheet-secondary/)
    assert.match(gameCss, /\.recent-plays-list\s*\{[^}]*overflow-x:\s*auto/s)
    assert.match(sidebarCss, /\.ball-types-grid\s*\{[^}]*overflow-x:\s*auto/s)
    assert.match(boardCss, /aspect-ratio:\s*760\s*\/\s*570/)
    assert.match(boardCss, /\.plinko-canvas\s*\{[^}]*width:\s*100%\s*!important[^}]*height:\s*100%\s*!important/s)
    assert.equal((board.match(/className="plinko-canvas"/g) || []).length, 1)
})

test('mobile bet sheet owns collapse, escape, focus, and scroll-lock behavior', async () => {
    const [component, css] = await sources([
        './src/components/MobileBetSheet.jsx',
        './src/components/MobileBetSheet.css',
    ])

    assert.match(component, /data-state=/)
    assert.match(component, /aria-expanded=/)
    assert.match(component, /event\.key === 'Escape'/)
    assert.match(component, /event\.key === 'Tab'/)
    assert.match(component, /backgroundNode\.inert = true/)
    assert.match(component, /aria-modal=/)
    assert.match(component, /mobile-overlay-open/)
    assert.match(css, /position:\s*fixed/)
    assert.match(css, /bottom:\s*var\(--mobile-nav-space\)/)
    assert.match(css, /prefers-reduced-motion/)
})
