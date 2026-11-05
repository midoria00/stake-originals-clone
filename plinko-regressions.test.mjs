import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createServer } from 'vite'

const root = new URL('.', import.meta.url)

test('Vercel serves browser routes through the SPA entry point', () => {
    const configUrl = new URL('vercel.json', root)
    assert.ok(existsSync(configUrl), 'vercel.json is missing')

    const config = JSON.parse(readFileSync(configUrl, 'utf8'))
    // The account API rewrite must come before the SPA fallback, which stays last.
    assert.deepEqual(config.rewrites, [
        { source: '/api/app/:path*', destination: '/api/app?route=:path*' },
        { source: '/(.*)', destination: '/index.html' },
    ])
})

test('Plinko engine refuses more than 20 active balls', async () => {
    globalThis.window = { devicePixelRatio: 1 }
    const server = await createServer({ configFile: false, server: { middlewareMode: true } })

    try {
        const { default: PlinkoEngine } = await server.ssrLoadModule('/src/components/PlinkoGame/PlinkoEngine.js')
        const context = new Proxy({}, { get: () => () => {} })
        const canvas = { style: {}, getContext: () => context }
        let balanceChanges = 0
        const engine = new PlinkoEngine(canvas, { onBalanceChange: () => balanceChanges++ })

        for (let index = 0; index < 20; index++) {
            assert.ok(engine.dropBall(8, 'normal'))
        }

        assert.equal(engine.dropBall(8, 'normal'), null)
        assert.equal(engine.getActiveBallCount(), 20)
        assert.equal(balanceChanges, 20)
    } finally {
        await server.close()
        delete globalThis.window
    }
})

test('Plinko reserves pending fairness work before accepting another drop', async () => {
    const server = await createServer({ configFile: false, server: { middlewareMode: true } })
    const resolvers = []

    try {
        const { dropPlinkoBall } = await server.ssrLoadModule('/src/components/PlinkoGame/dropPlinkoBall.js')
        const pendingDrops = { current: 0 }
        const engine = {
            getActiveBallCount: () => 0,
            updateBallStyle: () => {},
            dropBall: () => ({}),
        }
        const provablyFair = {
            generatePlinkoPath: () => new Promise(resolve => resolvers.push(resolve)),
        }
        const options = {
            engine,
            pendingDrops,
            provablyFair,
            rowCount: 16,
            betAmount: 1,
            currentBall: { color: '#f00', image: null },
            selectedBallType: 'normal',
            placeBet: () => true,
        }

        const accepted = Array.from({ length: 20 }, () => dropPlinkoBall(options))
        assert.equal(await dropPlinkoBall(options), 'busy')
        assert.equal(pendingDrops.current, 20)

        resolvers.forEach(resolve => resolve({ path: Array(16).fill(0) }))
        assert.deepEqual(await Promise.all(accepted), Array(20).fill('dropped'))
        assert.equal(pendingDrops.current, 0)
    } finally {
        await server.close()
    }
})

test('Plinko does not charge when capacity fills during fairness work', async () => {
    const server = await createServer({ configFile: false, server: { middlewareMode: true } })

    try {
        const { dropPlinkoBall } = await server.ssrLoadModule('/src/components/PlinkoGame/dropPlinkoBall.js')
        let activeBalls = 19
        let charges = 0
        let resolveFairness
        const result = dropPlinkoBall({
            engine: {
                getActiveBallCount: () => activeBalls,
                updateBallStyle: () => {},
                dropBall: () => ({}),
            },
            pendingDrops: { current: 0 },
            provablyFair: {
                generatePlinkoPath: () => new Promise(resolve => { resolveFairness = resolve }),
            },
            rowCount: 16,
            betAmount: 1,
            currentBall: { color: '#f00', image: null },
            selectedBallType: 'normal',
            placeBet: () => { charges++; return true },
        })

        activeBalls = 20
        resolveFairness({ path: Array(16).fill(0) })
        assert.equal(await result, 'busy')
        assert.equal(charges, 0)
    } finally {
        await server.close()
    }
})

test('stopping Auto Bet cancels pending fairness before charging', async () => {
    const server = await createServer({ configFile: false, server: { middlewareMode: true } })

    try {
        const { dropPlinkoBall } = await server.ssrLoadModule('/src/components/PlinkoGame/dropPlinkoBall.js')
        let cancelled = false
        let charges = 0
        let resolveFairness
        const result = dropPlinkoBall({
            engine: {
                getActiveBallCount: () => 0,
                updateBallStyle: () => {},
                dropBall: () => ({}),
            },
            pendingDrops: { current: 0 },
            provablyFair: {
                generatePlinkoPath: () => new Promise(resolve => { resolveFairness = resolve }),
            },
            rowCount: 16,
            betAmount: 1,
            currentBall: { color: '#f00', image: null },
            selectedBallType: 'normal',
            placeBet: () => { charges++; return true },
            isCancelled: () => cancelled,
        })

        cancelled = true
        resolveFairness({ path: Array(16).fill(0) })
        assert.equal(await result, 'cancelled')
        assert.equal(charges, 0)
    } finally {
        await server.close()
    }
})

test('Auto Bet uses state and exactly one interval owner', () => {
    const sidebar = readFileSync(new URL('src/components/PlinkoGame/Sidebar.jsx', root), 'utf8')

    assert.match(sidebar, /const \[isAutoBetting, setIsAutoBetting\] = useState\(false\)/)
    assert.equal(sidebar.match(/setInterval\(/g)?.length, 1)
    assert.doesNotMatch(sidebar, /autoBetIntervalRef/)
})

test('server-mode Plinko drops the server bin, counts the request as pending and never requests after cancel', async () => {
    const server = await createServer({ configFile: false, server: { middlewareMode: true } })

    try {
        const { dropPlinkoBall } = await server.ssrLoadModule('/src/components/PlinkoGame/dropPlinkoBall.js')
        const dropped = []
        const base = {
            engine: {
                getActiveBallCount: () => 0,
                updateBallStyle: () => {},
                dropBall: (bin) => { dropped.push(bin); return {} },
            },
            pendingDrops: { current: 0 },
            provablyFair: { generatePlinkoPath: () => { throw new Error('local fairness must not run') } },
            rowCount: 16,
            betAmount: 1,
            currentBall: { color: '#f00', image: null },
            selectedBallType: 'normal',
            placeBet: () => { throw new Error('local wallet must not be charged') },
        }

        let resolvePlay
        const pending = dropPlinkoBall({ ...base, serverPlay: () => new Promise(resolve => { resolvePlay = resolve }) })
        assert.equal(base.pendingDrops.current, 1)
        resolvePlay(5)
        assert.equal(await pending, 'dropped')
        assert.deepEqual(dropped, [5])
        assert.equal(base.pendingDrops.current, 0)

        let requests = 0
        const serverPlay = async () => { requests++; return 3 }
        assert.equal(await dropPlinkoBall({ ...base, serverPlay, isCancelled: () => true }), 'cancelled')
        assert.equal(requests, 0)

        const insufficient = Object.assign(new Error('x'), { code: 'insufficient_funds' })
        assert.equal(await dropPlinkoBall({ ...base, serverPlay: async () => { throw insufficient } }), 'insufficient-funds')
        assert.equal(await dropPlinkoBall({ ...base, serverPlay: async () => { throw new Error('boom') } }), 'error')
        assert.deepEqual(dropped, [5])
        assert.equal(base.pendingDrops.current, 0)
    } finally {
        await server.close()
    }
})
