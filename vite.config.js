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
        Object.assign(process.env, loadEnv(config.mode, config.root, ['API_FOOTBALL_', 'CASINO_', 'ADMIN_']))
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
}

const route = (kinds, handler) => async (req, res, next) => {
    const kind = kinds[req.url.split('?')[0]]
    if (!kind) return next()
    const request = new Request(new URL(req.originalUrl, 'http://localhost'), { method: req.method, headers: req.headers })
    const response = await handler(request, kind)
    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.end(await response.text())
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
