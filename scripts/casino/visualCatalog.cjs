// Visual and behaviour check of the game catalog in a real Chromium, at several widths:
// cards (cover or placeholder, names legible and clear of the art, badges, no horizontal scroll),
// covers that load, fail (404, not an image) or arrive slowly (box keeps its size), lazy loading,
// filters, debounced search, paging without duplicates, favourites, recents, header search,
// provider and game pages, and a script-like game name rendered as plain text.
//
//   npm run build && npx vite preview --port 4174     # or npm run preview:contas
//   node scripts/casino/visualCatalog.cjs               # needs Playwright with Chromium
//
// BASE_URL selects another deployment, VERCEL_SHARE_URL a temporary share link for a protected
// preview, WIDTHS (default 1440,768,390,375) and OUT_DIR (screenshots and results.json).
// Covers used here are generated test pictures served by the browser itself (route interception
// on an .invalid host): no third-party image is requested.
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const BASE = (process.env.BASE_URL || 'http://localhost:4174').replace(/\/$/, '')
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'visual-check', 'catalog')
const WIDTHS = (process.env.WIDTHS || '1440,768,390,375').split(',').map(Number)
const FIXTURE_HOST = 'https://covers.fixture.invalid'
fs.mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A real, decodable PNG of one colour (stored zlib stream, CRC per chunk).
function png(width, height, [r, g, b]) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3)
    const raw = Buffer.concat(Array.from({ length: height }, () => row))
    const chunk = (type, data) => {
        const head = Buffer.alloc(8)
        head.writeUInt32BE(data.length, 0)
        head.write(type, 4, 'latin1')
        const crc = Buffer.alloc(4)
        crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0)
        return Buffer.concat([head, data, crc])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr.set([8, 2, 0, 0, 0], 8)
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const COLORS = [[220, 60, 60], [60, 160, 90], [60, 100, 220], [210, 160, 40], [150, 70, 200], [40, 170, 190]]

// Rewrites catalog responses: `covers(item, index)` returns an image object or null.
async function rewriteGames(page, { covers = null, rename = null } = {}) {
    await page.route('**/api/casino/games**', async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        body.items = body.items.map((item, index) => {
            const next = { ...item }
            const cover = covers?.(item, index)
            if (cover !== undefined && cover !== null) next.image = cover
            if (rename?.[item.id]) next.name = rename[item.id]
            return next
        })
        await route.fulfill({ response, json: body })
    })
}

// Serves fixture covers: /ok-N.png, /slow-N.png (2.5 s), /missing-N.png (404), /html-N.png (not an image).
async function serveFixtures(page, log) {
    await page.route(`${FIXTURE_HOST}/**`, async (route) => {
        const url = new URL(route.request().url())
        log?.push(url.pathname)
        const [kind, n] = url.pathname.slice(1).split('-')
        if (kind === 'missing') return route.fulfill({ status: 404, body: 'not found' })
        if (kind === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>window.__fixtureScript = 1</script>' })
        if (kind === 'slow') await sleep(2500)
        return route.fulfill({ status: 200, contentType: 'image/png', body: png(320, 400, COLORS[Number(n) % COLORS.length]), headers: { 'cache-control': 'public, max-age=3600' } })
    })
}

// One URL per game (like real covers): kind and colour index, then the game id.
const cover = (kind, n, id) => ({ src: `${FIXTURE_HOST}/${kind}-${n}-${id.replace(/[^a-z0-9]+/g, '_')}.png`, avif: null, webp: null, width: 320, height: 400 })

async function noHorizontalScroll(page) {
    return page.evaluate(() => {
        const scrollers = [document.documentElement, ...document.querySelectorAll('.page')]
        return scrollers.every((el) => el.scrollWidth <= el.clientWidth + 1)
    })
}

async function cardsLayout(page, limit = 12) {
    return page.evaluate((limit) => [...document.querySelectorAll('.catalog-grid .catalog-card:not(.catalog-card--skeleton)')].slice(0, limit).map((card) => {
        const art = card.querySelector('.catalog-card__art').getBoundingClientRect()
        const name = card.querySelector('.catalog-card__name').getBoundingClientRect()
        const badge = card.querySelector('.catalog-card__badge')?.getBoundingClientRect()
        const fav = card.querySelector('.game-card__fav')?.getBoundingClientRect()
        return {
            id: card.querySelector('a').getAttribute('href'),
            artRatio: art.height / art.width,
            nameBelowArt: name.top >= art.bottom - 0.5,
            nameHeight: name.height,
            badgeInside: !badge || (badge.left >= art.left && badge.right <= art.right && badge.top >= art.top && badge.bottom <= art.bottom),
            badgeClearOfStar: !badge || !fav || badge.right <= fav.left || badge.bottom <= fav.top,
            art: card.querySelector('[data-art]')?.getAttribute('data-art'),
        }
    }), limit)
}

async function run(browser, width) {
    const mobile = width < 600
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', (dialog) => { errors.push(`dialog: ${dialog.message()}`); dialog.dismiss() })
    if (process.env.VERCEL_SHARE_URL) await page.goto(process.env.VERCEL_SHARE_URL, { waitUntil: 'domcontentloaded' })
    const tag = `${width}px`

    // 1. All games: placeholders for catalog-only games, Originals with their covers, stable cards.
    const apiCalls = []
    page.on('request', (request) => { if (request.url().includes('/api/casino/games')) apiCalls.push(new URL(request.url()).search) })
    await page.goto(`${BASE}/cassino/jogos`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.catalog-grid .catalog-card:not(.catalog-card--skeleton)')
    await sleep(400)
    let layout = await cardsLayout(page, 24)
    check(`${tag} all games: first page of cards`, layout.length === 24, `${layout.length} cards`)
    check(`${tag} art keeps 4:5 boxes`, layout.every((c) => Math.abs(c.artRatio - 1.25) < 0.02))
    check(`${tag} names sit below the art, up to two lines`, layout.every((c) => c.nameBelowArt && c.nameHeight >= 15 && c.nameHeight <= 46), JSON.stringify(layout.find((c) => !c.nameBelowArt || c.nameHeight < 15 || c.nameHeight > 46) ?? ''))
    const heights = await page.$$eval('.catalog-grid .catalog-card', (cards) => cards.slice(0, 24).map((card) => Math.round(card.getBoundingClientRect().height)))
    check(`${tag} every card has the same height`, new Set(heights).size === 1, [...new Set(heights)].join(', '))
    check(`${tag} badges inside the art and clear of the star`, layout.every((c) => c.badgeInside && c.badgeClearOfStar))
    const originals = await page.evaluate(() => [...document.querySelectorAll('.catalog-card')].filter((card) => card.querySelector('a')?.getAttribute('href')?.match(/^\/(crash|plinko|mines|dino|dice|limbo)$/)).map((card) => {
        const img = card.querySelector('img')
        return { href: card.querySelector('a').getAttribute('href'), loaded: Boolean(img?.complete && img.naturalWidth > 0), src: img?.getAttribute('src') }
    }))
    check(`${tag} Originals keep their own covers`, originals.length === 6 && originals.every((o) => o.src?.startsWith('/images/')), JSON.stringify(originals.map((o) => o.src)))
    check(`${tag} third-party cards show the placeholder (no authorized cover)`, layout.filter((c) => !/^\/(crash|plinko|mines|dino|dice|limbo)$/.test(c.id)).every((c) => c.art === 'fallback'))
    check(`${tag} no horizontal scroll`, await noHorizontalScroll(page))
    await page.screenshot({ path: path.join(OUT, `all-games-${width}.png`) })

    // 2. Paging: the next page arrives without duplicates.
    await page.locator('.catalog-more button').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelectorAll('.catalog-grid .catalog-card:not(.catalog-card--skeleton)').length >= 48, null, { timeout: 15000 })
    const hrefs = await page.$$eval('.catalog-grid .catalog-card:not(.catalog-card--skeleton) a', (links) => links.map((a) => a.getAttribute('href')))
    check(`${tag} infinite scroll loads the next page without duplicates`, hrefs.length >= 48 && new Set(hrefs).size === hrefs.length, `${hrefs.length} cards`)
    check(`${tag} each page is requested once`, apiCalls.length === new Set(apiCalls).size, apiCalls.join(' | '))

    // 3. Debounced search: typing a word quickly asks the server once.
    await page.evaluate(() => document.querySelector('.page')?.scrollTo(0, 0))
    const before = apiCalls.length
    await page.locator('.catalog-filters input[type="search"]').pressSequentially('bonanza', { delay: 60 })
    await page.waitForFunction(() => /bonanza/i.test(document.querySelector('.catalog-grid .catalog-card__name')?.textContent ?? ''), null, { timeout: 10000 })
    await sleep(500)
    const searchCalls = apiCalls.slice(before).filter((q) => q.includes('q='))
    check(`${tag} search waits for a pause (one request for one word)`, searchCalls.length === 1, searchCalls.join(' | '))
    const names = await page.$$eval('.catalog-grid .catalog-card__name', (els) => els.map((el) => el.textContent))
    check(`${tag} search results match`, names.length > 0 && names.every((n) => /bonanza/i.test(n)), `${names.length} results`)

    // 4. Filters: provider and sort.
    await page.locator('.catalog-filters input[type="search"]').fill('')
    await page.locator('.catalog-filters select').nth(0).selectOption('pg-soft')
    await page.waitForFunction(() => /24 jogos/.test(document.querySelector('.catalog-summary')?.textContent ?? ''), null, { timeout: 10000 })
    check(`${tag} provider filter (PG Soft: 24 games)`, true)
    await page.locator('.catalog-filters select').nth(2).selectOption('az')
    await sleep(800)
    const sorted = await page.$$eval('.catalog-grid .catalog-card__name', (els) => els.map((el) => el.textContent))
    check(`${tag} A–Z sort`, sorted.length === 24 && sorted.every((n, i) => i === 0 || sorted[i - 1].localeCompare(n, 'pt-BR') <= 0))
    check(`${tag} filters keep the URL in sync`, /provedor=pg-soft/.test(page.url()) && /ordem=az/.test(page.url()))

    // 5. Covers that load, fail and arrive late (fixture pictures, rewritten API responses).
    const coverPage = await context.newPage()
    coverPage.on('pageerror', (error) => errors.push(error.message))
    const fixtureRequests = []
    await serveFixtures(coverPage, fixtureRequests)
    const kinds = ['ok', 'missing', 'slow', 'html']
    await rewriteGames(coverPage, { covers: (item, index) => (item.provider === '123bet' ? undefined : cover(kinds[index % 4], index, item.id)) })
    await coverPage.goto(`${BASE}/cassino/jogos?provedor=pragmatic-play`, { waitUntil: 'domcontentloaded' })
    await coverPage.waitForSelector('.catalog-grid .catalog-card:not(.catalog-card--skeleton)')
    await sleep(300)
    const early = await cardsLayout(coverPage, 8)

    await sleep(3200)
    const late = await cardsLayout(coverPage, 8)
    const state = await coverPage.evaluate(() => [...document.querySelectorAll('.catalog-grid .catalog-card')].slice(0, 8).map((card) => {
        const img = card.querySelector('img')
        const id = decodeURIComponent(card.querySelector('a').getAttribute('href').split('/').pop())
        return { id, art: card.querySelector('[data-art]')?.getAttribute('data-art'), src: img?.getAttribute('src') ?? null, loaded: Boolean(img?.complete && img.naturalWidth === 320) }
    }))
    const expectArt = (index) => (kinds[index % 4] === 'ok' || kinds[index % 4] === 'slow' ? 'cover' : 'fallback')
    check(`${tag} valid covers load on the right card`, state.every((s, i) => expectArt(i) !== 'cover' || (s.art === 'cover' && s.loaded && s.src.endsWith(`-${s.id.replace(/[^a-z0-9]+/g, '_')}.png`))), JSON.stringify(state.slice(0, 4)))
    check(`${tag} missing (404) and non-image covers fall back to the placeholder`, state.every((s, i) => expectArt(i) !== 'fallback' || s.art === 'fallback'))
    check(`${tag} slow covers keep the box (no layout shift)`, early.every((c, i) => Math.abs(c.artRatio - late[i].artRatio) < 0.01))
    check(`${tag} a non-image response never runs as a page`, !(await coverPage.evaluate(() => window.__fixtureScript)))
    // Lazy loading: with three pages on screen, covers far below the fold are not requested until
    // the list scrolls to them. Chromium starts lazy images 1250 px ahead on 4G and up to 5000 px
    // when the connection type is unknown (as in headless runs), hence the 5200 px margin.
    for (const count of [48, 72]) {
        await coverPage.evaluate(() => document.querySelector('.catalog-more button')?.click())
        await coverPage.waitForFunction((n) => document.querySelectorAll('.catalog-grid .catalog-card:not(.catalog-card--skeleton)').length >= n, count, { timeout: 15000 })
    }
    await sleep(1500)
    const lazy = await coverPage.evaluate(() => [...document.querySelectorAll('.catalog-grid img')].map((img) => img.getAttribute('loading')))
    const far = await coverPage.evaluate(() => [...document.querySelectorAll('.catalog-grid img')]
        .filter((img) => img.getBoundingClientRect().top > window.innerHeight + 5200)
        .map((img) => new URL(img.getAttribute('src')).pathname))
    const farEarly = far.filter((p) => fixtureRequests.includes(p))
    await coverPage.evaluate(() => document.querySelector('.catalog-grid .catalog-card:last-child')?.scrollIntoView())
    await sleep(far.length ? 3500 : 200)
    const farLater = far.filter((p) => fixtureRequests.includes(p))
    check(`${tag} covers load lazily`, lazy.every((l) => l === 'lazy') && farEarly.length === 0 && farLater.length > 0 === far.length > 0,
        `${far.length} covers far below the fold: ${farEarly.length} requested early, ${farLater.length} after scrolling`)
    await coverPage.screenshot({ path: path.join(OUT, `covers-fixture-${width}.png`) })
    await coverPage.close()

    // 6. A script-like name is shown as text.
    const xssPage = await context.newPage()
    xssPage.on('dialog', (dialog) => { errors.push(`dialog: ${dialog.message()}`); dialog.dismiss() })
    await rewriteGames(xssPage, { covers: () => undefined, rename: { 'pg-soft:fortune-tiger': '<img src=x onerror="window.__xss=1">Tigre' } })
    await xssPage.goto(`${BASE}/cassino/jogos?provedor=pg-soft&ordem=az`, { waitUntil: 'domcontentloaded' })
    await xssPage.waitForSelector('.catalog-grid .catalog-card:not(.catalog-card--skeleton)')
    await sleep(500)
    const xss = await xssPage.evaluate(() => ({ ran: Boolean(window.__xss), injected: document.querySelectorAll('.catalog-grid img[src="x"]').length, text: [...document.querySelectorAll('.catalog-card__name')].some((el) => el.textContent.includes('<img')) }))
    check(`${tag} game names render as text (no HTML injection)`, !xss.ran && xss.injected === 0, JSON.stringify(xss))
    await xssPage.close()

    // 7. Favourites and recents for a catalog game, and its detail page.
    await page.goto(`${BASE}/cassino/provedores/pg-soft`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.catalog-grid .catalog-card:not(.catalog-card--skeleton)')
    const providerCards = await page.locator('.catalog-grid .catalog-card').count()
    check(`${tag} provider page lists its games`, providerCards === 24, `${providerCards} cards`)
    const first = page.locator('.catalog-grid .catalog-card').first()
    const firstName = (await first.locator('.catalog-card__name').textContent()).trim()
    const firstHref = await first.locator('a').getAttribute('href')
    await first.locator('.game-card__fav').click()
    check(`${tag} star toggles on`, (await first.locator('.game-card__fav').getAttribute('aria-pressed')) === 'true')
    await page.goto(`${BASE}${firstHref}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.game-hero')
    const detail = await page.evaluate(() => ({
        title: document.querySelector('h1')?.textContent,
        art: document.querySelector('.game-hero [data-art]')?.getAttribute('data-art'),
        reason: document.querySelector('.game-hero__info h2')?.textContent,
        source: document.querySelector('a[href="https://slot.report/"]')?.textContent ?? null,
        artBox: (() => { const r = document.querySelector('.game-hero__art').getBoundingClientRect(); return r.height / r.width })(),
    }))
    check(`${tag} detail page: placeholder art, reason and linked source`, detail.title?.includes(firstName) && detail.art === 'fallback' && Boolean(detail.reason) && detail.source === 'slot.report', JSON.stringify(detail))
    check(`${tag} detail page: no horizontal scroll`, await noHorizontalScroll(page))
    await page.screenshot({ path: path.join(OUT, `detail-${width}.png`) })
    await page.goto(`${BASE}/favoritos`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#fav-catalog')
    await page.waitForSelector('section[aria-labelledby="fav-catalog"] .catalog-card:not(.catalog-card--skeleton)')
    const favNames = await page.$$eval('section[aria-labelledby="fav-catalog"] .catalog-card__name', (els) => els.map((el) => el.textContent.trim()))
    check(`${tag} favourites list the catalog game`, favNames.includes(firstName), favNames.join(', '))
    await page.screenshot({ path: path.join(OUT, `favorites-${width}.png`) })
    await page.goto(`${BASE}/recentes`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('section[aria-labelledby="recent-catalog"] .catalog-card:not(.catalog-card--skeleton)')
    const recent = await page.$$eval('section[aria-labelledby="recent-catalog"] .catalog-card', (cards) => cards.map((card) => ({ name: card.querySelector('.catalog-card__name').textContent.trim(), meta: card.querySelector('.catalog-card__meta').textContent })))
    check(`${tag} recents list the opened catalog game with its time`, recent[0]?.name === firstName && /Aberto em/.test(recent[0]?.meta ?? ''), JSON.stringify(recent[0] ?? null))
    await page.screenshot({ path: path.join(OUT, `recent-${width}.png`) })
    await page.goto(`${BASE}/favoritos`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('section[aria-labelledby="fav-catalog"] .catalog-card:not(.catalog-card--skeleton)')
    await page.locator('section[aria-labelledby="fav-catalog"] .catalog-card .game-card__fav').first().click()
    await sleep(300)
    check(`${tag} unfavouriting removes the catalog section`, (await page.locator('#fav-catalog').count()) === 0)

    // 8. Header search opens the catalog search and stays in sync on that page (desktop header).
    const headerSearch = page.locator('.app-header__search input[type="search"]')
    if (await headerSearch.isVisible().catch(() => false)) {
        await page.goto(`${BASE}/cassino/jogos`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.catalog-grid .catalog-card:not(.catalog-card--skeleton)')
        await headerSearch.fill('gates')
        await page.waitForSelector('.search-box__list [role="option"]')
        const options = await page.$$eval('.search-box__list [role="option"]', (els) => els.map((el) => el.textContent))
        check(`${tag} header search offers the catalog search`, options.some((o) => o.includes('em todos os jogos do cassino')), options.join(' | '))
        await page.locator('.search-box__list [role="option"]', { hasText: 'em todos os jogos do cassino' }).click()
        await page.waitForFunction(() => /q=gates/.test(location.search) && document.querySelector('.catalog-filters input[type="search"]')?.value === 'gates', null, { timeout: 5000 })
        await headerSearch.fill('sugar')
        await page.locator('.search-box__list [role="option"]', { hasText: 'em todos os jogos do cassino' }).click()
        await sleep(1200)
        const synced = await page.evaluate(() => ({ q: new URLSearchParams(location.search).get('q'), input: document.querySelector('.catalog-filters input[type="search"]')?.value }))
        check(`${tag} a second header search on the catalog page is not undone`, synced.q === 'sugar' && synced.input === 'sugar', JSON.stringify(synced))
    }

    check(`${tag} no page errors or dialogs`, errors.length === 0, errors.slice(0, 3).join(' | '))
    await context.close()
}

;(async () => {
    const browser = await chromium.launch()
    try {
        for (const width of WIDTHS) await run(browser, width)
    } finally {
        await browser.close()
    }
    const failed = results.filter((r) => !r.ok)
    fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify({ base: BASE, widths: WIDTHS, passed: results.length - failed.length, failed: failed.length, results }, null, 2)}\n`)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    process.exit(failed.length ? 1 : 0)
})().catch((error) => {
    console.error(error)
    process.exit(1)
})
