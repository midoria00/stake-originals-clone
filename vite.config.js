import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { handle as handleSportsApi } from './server/sports/http.js'
import { handle as handleCasinoApi } from './server/casino/http.js'
import { handleAdmin } from './server/casino/admin.js'
import { createCasinoService, loadCatalog } from './server/casino/service.js'

// Serves /api/* in `vite` and `vite preview` the same way the Vercel Functions in /api do.
const localApi = {
    name: 'local-api',
    configResolved(config) {
        Object.assign(process.env, loadEnv(config.mode, config.root, ['API_FOOTBALL_', 'CASINO_', 'ADMIN_', 'SUPABASE_', 'ACCOUNT_', 'PAYMENT_', 'CRON_']))
    },
    configureServer(server) {
        mountApi(server.middlewares)
    },
    configurePreviewServer(server) {
        mountApi(server.middlewares)
    },
}

function mountApi(middlewares) {
    middlewares.use('/api/sports', route({ '/matches': 'matches', '/match': 'match' }, handleSportsApi))
    middlewares.use('/api/casino', route({ '/providers': 'providers', '/games': 'games', '/launch': 'launch' }, handleCasinoApi))
    middlewares.use('/api/admin', route({ '/status': 'status' }, (request) => {
        const catalog = loadCatalog()
        return handleAdmin(request, { service: createCasinoService({ catalog }), catalog })
    }))
    middlewares.use('/api/app', async (req, res) => {
        const app = await accountApp()
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
        send(res, await app.handle(new Request(new URL(req.originalUrl, `http://${req.headers.host}`), { method: req.method, headers: req.headers, body })))
    })
}

// ACCOUNTS_EMULATOR=1 (local only): accounts run on an in-memory Postgres with a Supabase Auth
// stand-in, seeded with jogador@123bet.local and admin@123bet.local (password Senha-local-123).
let accountAppPromise
function accountApp() {
    accountAppPromise ??= (async () => {
        const { createAccountApp } = await import('./server/account/app.js')
        if (process.env.ACCOUNTS_EMULATOR !== '1' || process.env.VERCEL) return createAccountApp()
        const { createTestDatabase } = await import('./server/account/testing/pg.js')
        const { createEmulator } = await import('./server/account/testing/emulator.js')
        const keys = { serviceKey: 'sb_secret_local_emulator_key_0000000', anonKey: 'sb_publishable_local_emulator_0000000' }
        const emulator = createEmulator({ db: await createTestDatabase(), ...keys })
        await emulator.seedUser({ email: 'jogador@123bet.local', password: 'Senha-local-123', username: 'jogador_local' })
        await emulator.seedUser({ email: 'admin@123bet.local', password: 'Senha-local-123', username: 'admin_local', role: 'admin' })
        console.log('[accounts] emulator on: jogador@123bet.local / admin@123bet.local, password Senha-local-123; e-mail links are logged below')
        const fetch = async (target, init) => {
            const response = await emulator.fetch(target, init)
            const mail = emulator.outbox.at(-1)
            if (mail && !mail.logged) {
                mail.logged = true
                console.log(`[accounts] e-mail (${mail.type}) to ${mail.to}: /conta/${mail.type === 'recovery' ? 'redefinir-senha' : 'confirmar'}?token_hash=${mail.tokenHash}&type=${mail.type === 'recovery' ? 'recovery' : 'email'}`)
            }
            return response
        }
        return createAccountApp({
            env: {
                SUPABASE_URL: 'https://emulator.supabase.local', SUPABASE_ANON_KEY: keys.anonKey, SUPABASE_SERVICE_ROLE_KEY: keys.serviceKey,
                ACCOUNT_HASH_SECRET: 'local-emulator-hash-secret-000000000000', PAYMENT_SANDBOX_WEBHOOK_SECRET: 'local-emulator-sandbox-secret-0000000000',
            },
            fetch,
        })
    })()
    return accountAppPromise
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (chunk) => {
            size += chunk.length
            if (size > 64 * 1024) req.destroy()
            else chunks.push(chunk)
        })
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
    })
}

async function send(res, response) {
    res.statusCode = response.status
    response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') res.setHeader(name, value)
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) res.setHeader('set-cookie', cookies)
    res.end(Buffer.from(await response.arrayBuffer()))
}

const route = (kinds, handler) => async (req, res, next) => {
    const kind = kinds[req.url.split('?')[0]]
    if (!kind) return next()
    const request = new Request(new URL(req.originalUrl, 'http://localhost'), { method: req.method, headers: req.headers })
    await send(res, await handler(request, kind))
}

export default defineConfig({
    plugins: [react(), localApi],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            phaser: path.resolve(__dirname, "./src/vendor/phaser-global.js"),
        },
    },
    optimizeDeps: {
        exclude: ['phaser'],
    },
    server: {
        port: 5173,
        open: true
    },
    build: {
        outDir: 'dist'
    }
})
