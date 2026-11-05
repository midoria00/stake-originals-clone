// Visual and server check of Crash and Dino in a real Chromium with the animations running:
// Crash (bet in the countdown, rising multiplier, manual cash out, crash/loss, a bet in the first
// second after opening the page) and Dino (start, server-decided jumps, multiplier growth, cash out,
// defeat), with the wallet, round history and ledger read back from the API after each step, at
// several widths (no horizontal scroll, Dino decision buttons not covered on phones).
//
//   npm run build && npm run preview:contas          # local emulator on http://localhost:4174
//   node scripts/accounts/visualCrashDino.cjs        # needs Playwright with Chromium installed
//
// BASE_URL selects another deployment, LOGIN_EMAIL / LOGIN_PASSWORD the account (defaults: the
// emulator's seeded player), VERCEL_SHARE_URL a temporary share link for a protected preview,
// WIDTHS (default 1440,768,390,375) and OUT_DIR (screenshots and results.json). Never prints
// passwords or tokens. Every bet is 1 fictional coin.
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const BASE = (process.env.BASE_URL || 'http://localhost:4174').replace(/\/$/, '')
const EMAIL = process.env.LOGIN_EMAIL || 'jogador@123bet.local'
const PASSWORD = process.env.LOGIN_PASSWORD || 'Senha-local-123'
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'visual-check')
const WIDTHS = (process.env.WIDTHS || '1440,768,390,375').split(',').map(Number)
fs.mkdirSync(OUT, { recursive: true })

const results = []
const lateClaims = []
const claims = []
const coveredButtons = []
const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(page, method, p, body) {
    return page.evaluate(async ({ method, p, body }) => {
        const r = await fetch(`/api/app/${p}`, {
            method,
            headers: { 'x-requested-with': '123bet', ...(body ? { 'content-type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'same-origin',
        })
        let data = null
        try { data = await r.json() } catch { /* empty */ }
        return { status: r.status, data }
    }, { method, p, body })
}
const serverWallet = async (page) => (await api(page, 'GET', 'wallet')).data?.wallet
const rounds = async (page, game) => (await api(page, 'GET', `history/rounds?game=${game}&limit=20`)).data
const txs = async (page) => (await api(page, 'GET', 'wallet/transactions?limit=50')).data

async function headerBalanceCents(page) {
    const label = await page.locator('.wallet-menu__button').first().getAttribute('aria-label').catch(() => null)
    if (!label) return null
    const m = label.match(/([\d.]+,\d{2}|[\d.]+)/)
    if (!m) return null
    return Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 100)
}

async function login(page) {
    await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
    await page.locator('input[type="email"]').first().fill(EMAIL)
    await page.locator('input[type="password"]').first().fill(PASSWORD)
    await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/app/auth/login')),
        page.locator('form button[type="submit"]').first().click(),
    ])
    await page.waitForFunction(async () => {
        const r = await fetch('/api/app/me', { headers: { 'x-requested-with': '123bet' } })
        const d = await r.json()
        return Boolean(d.user)
    }, null, { timeout: 15000 })
}

async function noHorizontalScroll(page) {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function crashMultiplier(page) {
    const text = await page.locator('.multiplier-title').first().textContent().catch(() => null)
    return text ? Number(text.replace('×', '').replace(',', '.').trim()) : NaN
}

async function crashButton(page) {
    // Desktop panel or the mobile bet sheet: the visible bet button.
    const buttons = page.locator('button.bet-button')
    const n = await buttons.count()
    for (let i = 0; i < n; i++) if (await buttons.nth(i).isVisible()) return buttons.nth(i)
    return buttons.first()
}

async function setAutoCashout(page, on) {
    let sw = page.locator('button.crash-switch').first()
    let expandedSheet = false
    if (!(await sw.isVisible().catch(() => false))) {
        // Phones: the switch is in the expandable part of the bet sheet.
        const handle = page.locator('.mobile-bet-sheet__handle').first()
        if (!(await handle.isVisible().catch(() => false))) return false
        await handle.click()
        expandedSheet = true
        await sleep(400)
        sw = page.locator('button.crash-switch').first()
        if (!(await sw.isVisible().catch(() => false))) return false
    }
    const checked = (await sw.getAttribute('aria-checked')) === 'true'
    if (checked !== on) await sw.click()
    const now = (await sw.getAttribute('aria-checked')) === 'true'
    if (expandedSheet) {
        await page.locator('.mobile-bet-sheet__handle').first().click()
        await sleep(400)
    }
    return now === on
}

async function waitCrashPhase(page, phase, timeout = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const label = (await (await crashButton(page)).textContent()) || ''
        const crashed = await page.locator('.multiplier-container.crashed').count()
        if (phase === 'waiting' && /Apostar/.test(label) && !crashed) {
            // Countdown "Começa em 3,4 s": bet with time to spare (a late bet is refused by design).
            const status = (await page.locator('.status-container').textContent().catch(() => '')) || ''
            const left = Number((status.match(/(\d+(?:[.,]\d+)?)\s*s/i) || [])[1]?.replace(',', '.'))
            if (left >= 1.5) return true
        }
        if (phase === 'running-bet' && /Sacar/.test(label)) return true
        if (phase === 'crashed' && crashed) return true
        await sleep(100)
    }
    return false
}

const TOAST_RECORDER = `(() => {
    window.__toasts = []
    const seen = new WeakSet()
    const scan = () => document.querySelectorAll('.toast-stack .toast').forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        window.__toasts.push(el.textContent.trim())
    })
    new MutationObserver(scan).observe(document, { childList: true, subtree: true })
})()`
async function toastTexts(page) {
    return page.evaluate(() => window.__toasts || []).catch(() => [])
}
async function resetToasts(page) {
    await page.evaluate(() => { window.__toasts = [] }).catch(() => {})
}

async function crashRound(page, { cashoutAt, tag, width }) {
    // Place the bet during the countdown.
    if (!(await waitCrashPhase(page, 'waiting', 30000))) return { error: 'no countdown' }
    await resetToasts(page)
    const before = await serverWallet(page)
    const btn = await crashButton(page)
    await btn.click()
    const placed = /Cancelar aposta/.test((await btn.textContent()) || '')
    // The stake is taken when the run starts.
    const started = await page.waitForResponse((r) => r.url().includes('/api/app/games/crash/start'), { timeout: 15000 }).catch(() => null)
    const startBody = started ? await started.json().catch(() => null) : null
    if (!started || started.status() !== 200) return { error: `start ${started?.status()}`, placed }
    const afterStart = await serverWallet(page)
    const seen = []
    let cashed = false
    let shownAtCashout
    let paidAt
    await page.waitForFunction(() => !document.querySelector('.multiplier-container.crashed'), null, { timeout: 15000 }).catch(() => null)
    // Watch the screen inside the page (no driver round trips): record the multiplier every frame and,
    // for a win, click "Sacar" on the first frame that shows the target, like a player would.
    const watcher = page.evaluate((target) => new Promise((resolve) => {
        const seen = []
        let shownAtCashout
        const t0 = performance.now()
        const frame = () => {
            const text = document.querySelector('.multiplier-title')?.textContent || ''
            const m = Number(text.replace('×', '').replace(',', '.').trim())
            if (!Number.isNaN(m)) seen.push(m)
            if (document.querySelector('.multiplier-container.crashed') || performance.now() - t0 > 90000) return resolve({ seen, shownAtCashout })
            if (target && shownAtCashout === undefined && m >= target) {
                const button = [...document.querySelectorAll('button.bet-button')].find((b) => b.offsetParent !== null && /Sacar/.test(b.textContent))
                if (button) {
                    shownAtCashout = m
                    button.click()
                    return resolve({ seen, shownAtCashout })
                }
            }
            requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
    }), cashoutAt)
    const cashoutResponse = cashoutAt ? page.waitForResponse((r) => r.url().includes('/api/app/games/crash/cashout'), { timeout: 120000 }).catch(() => null) : null
    await sleep(1200)
    await page.screenshot({ path: path.join(OUT, `crash-${width}-${tag}-running.png`) })
    const watched = await watcher
    seen.push(...watched.seen)
    shownAtCashout = watched.shownAtCashout
    if (shownAtCashout !== undefined) {
        const resp = await cashoutResponse
        const body = resp ? await resp.json().catch(() => null) : null
        const claim = (() => { try { return JSON.parse(resp?.request().postData() || '{}').multiplier } catch { return undefined } })()
        claims.push(`${width}/${tag}: shown ${shownAtCashout}, claimed ${claim}, paid ${body?.round?.result?.cashedOutAt}, crash ${body?.round?.result?.crashPoint}, state ${body?.state}`)
        // The server clock runs ahead of the screen by the request latency: a claim that reaches
        // it after the crash point loses (by design, latency never favours the player).
        cashed = resp ? (resp.status() === 200 && body?.state === 'cashed' ? 200 : `${resp.status()} ${body?.state}`) : 'no-response'
        if (cashed !== 200) lateClaims.push(`${shownAtCashout}x shown, ${body?.state} at ${body?.round?.result?.crashPoint}x`)
        paidAt = Number(body?.round?.result?.cashedOutAt)
        await sleep(400)
        await page.screenshot({ path: path.join(OUT, `crash-${width}-${tag}-cashout.png`) })
    }
    // Let the round finish visually (the rocket flies on to the public crash point).
    await page.waitForSelector('.multiplier-container.crashed', { timeout: 120000 }).catch(() => null)
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, `crash-${width}-${tag}-result.png`) })
    const toasts = await toastTexts(page)
    const after = await serverWallet(page)
    const hist = await rounds(page, 'crash')
    return { placed, startBody, before, afterStart, after, seen, cashed, toasts, hist, shownAtCashout, paidAt }
}

async function dinoRun(page, { jumpsBeforeCashout, tag, width }) {
    await resetToasts(page)
    const before = await serverWallet(page)
    const startBtn = page.locator('button.bet-button', { hasText: /Apostar|Jogar de novo/ }).first()
    await startBtn.waitFor({ state: 'visible', timeout: 20000 })
    const [started] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/app/games/dino/start'), { timeout: 15000 }).catch(() => null),
        startBtn.click(),
    ])
    if (!started || started.status() !== 200) return { error: `start ${started?.status()}` }
    const afterStart = await serverWallet(page)
    await sleep(800)
    await page.screenshot({ path: path.join(OUT, `dino-${width}-${tag}-start.png`) })
    const jumps = []
    let outcome = 'running'
    let cashout = null
    let cardAmount = null
    const t0 = Date.now()
    while (Date.now() - t0 < 120000) {
        const jumpBtn = page.locator('button.jump-btn').first()
        const visible = await jumpBtn.isVisible().catch(() => false)
        if (!visible) {
            // Run over (crash) or cashed out.
            if (await page.locator('button.bet-button', { hasText: /Jogar de novo|Apostar/ }).first().isVisible().catch(() => false)) {
                outcome = outcome === 'running' ? 'ended' : outcome
                break
            }
            await sleep(100)
            continue
        }
        const enabled = await jumpBtn.isEnabled()
        if (!enabled) { await sleep(80); continue }
        // Obstacle ahead: decide.
        if (jumpsBeforeCashout !== null && jumps.filter((j) => j.outcome === 'cleared').length >= jumpsBeforeCashout) {
            const cashBtn = page.locator('.jump-decision button.bet-button', { hasText: 'Sacar' }).first()
            const [resp] = await Promise.all([
                page.waitForResponse((r) => r.url().includes('/api/app/games/dino/cashout'), { timeout: 15000 }).catch(() => null),
                cashBtn.click(),
            ])
            cashout = resp ? { status: resp.status(), body: await resp.json().catch(() => null) } : null
            outcome = 'cashed'
            await sleep(700)
            cardAmount = await page.locator('.last-win-amount').first().textContent().catch(() => null)
            await page.screenshot({ path: path.join(OUT, `dino-${width}-${tag}-cashout.png`) })
            break
        }
        await page.screenshot({ path: path.join(OUT, `dino-${width}-${tag}-obstacle-${jumps.length + 1}.png`) })
        // Nothing may cover the decision buttons (the stake field used to sit on top of PULAR! on phones).
        const covered = await page.evaluate(() => {
            const out = []
            for (const button of document.querySelectorAll('.jump-decision button')) {
                const r = button.getBoundingClientRect()
                for (const [x, y] of [[r.left + 12, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 12, r.top + r.height / 2]]) {
                    const hit = document.elementFromPoint(x, y)
                    if (hit && !button.contains(hit)) out.push(`${button.textContent.trim().slice(0, 12)} @${Math.round(x)},${Math.round(y)} under ${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`)
                }
            }
            return out
        })
        coveredButtons.push(...covered.map((c) => `[${width}] ${c}`))
        const [resp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes('/api/app/games/dino/jump'), { timeout: 15000 }).catch(() => null),
            jumpBtn.click(),
        ])
        const body = resp ? await resp.json().catch(() => null) : null
        jumps.push({ status: resp?.status(), outcome: body?.outcome, multiplier: body?.multiplier, cleared: body?.cleared })
        await sleep(900)
        const hud = await page.locator('.hud-value.multiplier-glow').first().textContent().catch(() => null)
        jumps[jumps.length - 1].hud = hud
        if (body?.outcome && body.outcome !== 'cleared') { outcome = 'crashed'; break }
        if (jumps.length > 40) break
    }
    await sleep(1500)
    await page.screenshot({ path: path.join(OUT, `dino-${width}-${tag}-result.png`) })
    const toasts = await toastTexts(page)
    const after = await serverWallet(page)
    const hist = await rounds(page, 'dino')
    return { before, afterStart, after, jumps, outcome, cashout, toasts, hist, cardAmount }
}

;(async () => {
    const browser = await chromium.launch()
    const consoleErrors = []
    try {
        for (const width of WIDTHS) {
            const mobile = width < 769
            const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile && width < 500 })
            await context.addInitScript(TOAST_RECORDER)
            const page = await context.newPage()
            page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${width}] ${m.text().slice(0, 200)}`) })
            page.on('pageerror', (e) => consoleErrors.push(`[${width}] pageerror ${String(e).slice(0, 200)}`))
            page.on('response', async (r) => {
                if (r.status() >= 400 && r.url().startsWith(BASE)) {
                    let body = ''
                    try { body = (await r.text()).slice(0, 160) } catch { /* empty */ }
                    consoleErrors.push(`[${width}] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')} ${body}`)
                }
            })
            if (process.env.VERCEL_SHARE_URL) await page.goto(process.env.VERCEL_SHARE_URL, { waitUntil: 'domcontentloaded' })
            await login(page)
            check(`[${width}] login`, true)
            // Keep the balance away from the free-credit ceiling and low enough for free credits if needed.
            let w = await serverWallet(page)
            if (w.balance < 100000) await api(page, 'POST', 'wallet/free-credits', { amount: 1000, idempotencyKey: `visual-${width}-${Date.now()}` })

            // ---------------------------------------------------------------- Crash
            await page.goto(`${BASE}/crash`, { waitUntil: 'networkidle' })
            await page.waitForSelector('.multiplier-title', { timeout: 20000 })
            // A bet placed right after the page opens must start a server round (it used to be dropped).
            const earlyBtn = await crashButton(page)
            const [earlyStart] = await Promise.all([
                page.waitForResponse((r) => r.url().includes('/api/app/games/crash/start'), { timeout: 15000 }).catch(() => null),
                earlyBtn.click(),
            ])
            check(`[${width}] crash: bet placed in the first second after opening the page starts a server round`, earlyStart?.status() === 200, String(earlyStart?.status()))
            await page.waitForSelector('.multiplier-container.crashed', { timeout: 150000 }).catch(() => null)
            await page.screenshot({ path: path.join(OUT, `crash-${width}-loaded.png`) })
            check(`[${width}] crash: no horizontal scroll`, await noHorizontalScroll(page))
            const autoOff = await setAutoCashout(page, false)
            check(`[${width}] crash: auto cash out switched off for a manual cash out`, autoOff)

            // Win: manual cash out at >= 1.15x (retries when the round crashes first).
            let win = null
            for (let attempt = 0; attempt < 8 && !(win && win.cashed === 200); attempt++) {
                win = await crashRound(page, { cashoutAt: 1.15, tag: `win${attempt}`, width })
                if (win.error) console.log(`  crash attempt ${attempt}: ${win.error}`)
            }
            if (win.error) check(`[${width}] crash: round started`, false, win.error)
            else {
                const stake = win.startBody?.round?.stake
                check(`[${width}] crash: bet placed during the countdown (button turns into Cancelar aposta)`, win.placed)
                check(`[${width}] crash: stake debited on the server when the run starts`, win.afterStart.balance + win.afterStart.promoBalance === win.before.balance + win.before.promoBalance - stake, `stake ${stake}`)
                const rising = win.seen.filter((m, i) => i === 0 || m >= win.seen[i - 1]).length === win.seen.length && win.seen.at(-1) > 1
                check(`[${width}] crash: multiplier rises on screen`, rising && win.seen.length > 5, `${win.seen.length} readings, ${win.seen[0]} → ${win.seen.at(-1)}`)
                check(`[${width}] crash: manual cash out accepted`, win.cashed === 200, String(win.cashed))
                const last = win.hist?.items?.[0]
                const paid = last?.payout ?? 0
                check(`[${width}] crash: payout credited on the server`, win.after.balance + win.after.promoBalance === win.before.balance + win.before.promoBalance - stake + paid && paid > stake, `payout ${paid}`)
                check(`[${width}] crash: win toast shown`, win.toasts.some((t) => /Você ganhou/.test(t)), win.toasts.join(' | '))
                const at = Number(last?.result?.cashedOutAt)
                check(`[${width}] crash: round in history, cash out below the crash point, payout = stake x cash out`, last && at >= 1.14 && at <= Number(last.result?.crashPoint) && paid === Math.floor(stake * at + 1e-9), last ? `${at}x / crash ${last.result?.crashPoint}x, payout ${paid}` : 'none')
                check(`[${width}] crash: multiplier shown at cash out never above the paid one`, win.shownAtCashout !== undefined && win.shownAtCashout <= at, `shown ${win.shownAtCashout} paid ${at}`)
                await sleep(500)
                const headerAfter = await headerBalanceCents(page)
                check(`[${width}] crash: header balance matches the server`, headerAfter === win.after.balance + win.after.promoBalance, `${headerAfter} vs ${win.after.balance + win.after.promoBalance}`)
            }

            // Loss: bet without cashing out and let it crash.
            await setAutoCashout(page, false)
            const loss = await crashRound(page, { cashoutAt: null, tag: 'loss', width })
            if (loss.error) check(`[${width}] crash: losing round started`, false, loss.error)
            else {
                const stake = loss.startBody?.round?.stake
                const last = loss.hist?.items?.[0]
                check(`[${width}] crash: round crashes on screen`, loss.seen.length > 0)
                check(`[${width}] crash: loss keeps only the debit on the server`, loss.after.balance + loss.after.promoBalance === loss.before.balance + loss.before.promoBalance - stake && (last?.payout ?? 0) === 0, `stake ${stake}`)
                check(`[${width}] crash: loss toast shown`, loss.toasts.some((t) => /Você perdeu/.test(t)), loss.toasts.join(' | '))
            }

            // ---------------------------------------------------------------- Dino
            await page.goto(`${BASE}/dino`, { waitUntil: 'networkidle' })
            await page.waitForSelector('canvas', { timeout: 20000 })
            await sleep(1500)
            await page.screenshot({ path: path.join(OUT, `dino-${width}-loaded.png`) })
            check(`[${width}] dino: no horizontal scroll`, await noHorizontalScroll(page))
            // Cash out after the first cleared obstacle (retry when the first jump crashes).
            let run = null
            for (let attempt = 0; attempt < 10 && !(run && run.outcome === 'cashed'); attempt++) {
                run = await dinoRun(page, { jumpsBeforeCashout: 2, tag: `cash${attempt}`, width })
                if (run.error) break
            }
            if (run.error) check(`[${width}] dino: run started`, false, run.error)
            else {
                const cleared = run.jumps.filter((j) => j.outcome === 'cleared')
                const stake = run.cashout?.body?.round?.stake
                check(`[${width}] dino: stake debited on start`, run.afterStart.balance + run.afterStart.promoBalance < run.before.balance + run.before.promoBalance)
                check(`[${width}] dino: jump decided by the server and shown`, cleared.length >= 1 && cleared.every((j) => j.status === 200), JSON.stringify(cleared))
                const cm = cleared.map((j) => j.multiplier)
                check(`[${width}] dino: multiplier evolves jump after jump before the cash out`, cm.length >= 2 && cm.every((m, i) => i === 0 || m > cm[i - 1]), JSON.stringify(cm))
                check(`[${width}] dino: HUD shows the server multiplier after a cleared jump`, cleared.length >= 1 && cleared[0].multiplier > 1 && Math.abs(parseFloat((cleared[0].hud || '').replace(',', '.')) - cleared[0].multiplier) < 0.005, JSON.stringify(cleared.map((j) => [j.multiplier, j.hud])))
                check(`[${width}] dino: cash out accepted`, run.cashout?.status === 200)
                const payout = run.cashout?.body?.round?.payout
                check(`[${width}] dino: payout credited on the server`, run.after.balance + run.after.promoBalance === run.before.balance + run.before.promoBalance - stake + payout && payout > stake, `stake ${stake} payout ${payout}`)
                check(`[${width}] dino: cash out toast shown`, run.toasts.some((t) => /Saque realizado/.test(t)), run.toasts.join(' | '))
                check(`[${width}] dino: round in history`, run.hist?.items?.[0]?.payout === payout)
                const cardCents = run.cardAmount ? Math.round(Number(run.cardAmount.replace(/[^\d,]/g, '').replace(',', '.')) * 100) : null
                check(`[${width}] dino: last-game card shows the profit (+payout - stake)`, cardCents === payout - stake, `${run.cardAmount} vs ${(payout - stake) / 100}`)
            }
            // Loss: keep jumping until the dino crashes.
            let lossRun = null
            for (let attempt = 0; attempt < 3 && !(lossRun && lossRun.outcome === 'crashed'); attempt++) {
                lossRun = await dinoRun(page, { jumpsBeforeCashout: null, tag: `loss${attempt}`, width })
                if (lossRun.error) break
            }
            if (lossRun.error) check(`[${width}] dino: losing run started`, false, lossRun.error)
            else {
                const lastRound = lossRun.hist?.items?.[0]
                const stake = lastRound?.stake
                check(`[${width}] dino: crash (defeat) after ${lossRun.jumps.length} jump(s)`, lossRun.outcome === 'crashed', JSON.stringify(lossRun.jumps.map((j) => j.outcome)))
                check(`[${width}] dino: defeat keeps only the debit on the server`, lossRun.after.balance + lossRun.after.promoBalance === lossRun.before.balance + lossRun.before.promoBalance - stake && (lastRound?.payout ?? 0) === 0, `stake ${stake}`)
                check(`[${width}] dino: defeat toast shown`, lossRun.toasts.some((t) => /O Dino bateu/.test(t)), lossRun.toasts.join(' | '))
            }

            check(`[${width}] dino: jump and cash out buttons are not covered by other controls`, !coveredButtons.some((c) => c.startsWith(`[${width}]`)), coveredButtons.filter((c) => c.startsWith(`[${width}]`)).slice(0, 3).join('; '))
            // ---------------------------------------------------------------- History + ledger integrity
            const list = await txs(page)
            const items = list?.items ?? []
            const wNow = await serverWallet(page)
            const newest = items[0]
            check(`[${width}] ledger: newest movement balance equals the wallet`, newest && newest.balanceAfter === wNow.balance && newest.promoBalanceAfter === wNow.promoBalance, newest ? `${newest.balanceAfter}/${wNow.balance}` : 'none')
            let chain = true
            for (let i = 0; i + 1 < items.length; i++) {
                const a = items[i]
                const b = items[i + 1]
                if (a.balanceAfter !== b.balanceAfter + a.amount || a.promoBalanceAfter !== b.promoBalanceAfter + a.promoAmount) { chain = false; break }
            }
            check(`[${width}] ledger: each movement continues the previous balance`, chain, `${items.length} movements`)
            await page.goto(`${BASE}/conta/historico`, { waitUntil: 'networkidle' })
            await sleep(800)
            await page.screenshot({ path: path.join(OUT, `history-${width}.png`), fullPage: false })
            const pageText = await page.locator('main').textContent().catch(() => '')
            check(`[${width}] history page lists Crash and Dino rounds`, /Crash/.test(pageText) && /Dino/.test(pageText))
            check(`[${width}] history page: no horizontal scroll`, await noHorizontalScroll(page))
            await context.close()
        }
    } finally {
        await browser.close()
    }
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} passed`)
    console.log(`cash-out claims:\n  ${claims.join('\n  ')}`)
    if (lateClaims.length) console.log(`late cash-out claims (lost, as designed): ${lateClaims.join('; ')}`)
    if (consoleErrors.length) console.log(`console errors (${consoleErrors.length}):\n${[...new Set(consoleErrors)].slice(0, 15).join('\n')}`)
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, consoleErrors }, null, 2))
    process.exit(failed.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
