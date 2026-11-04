import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { handle as handleSportsApi } from './server/sports/http.js'

// Serves /api/sports/* in `vite` and `vite preview` the same way the Vercel Functions in /api do.
const sportsApi = {
    name: 'sports-api',
    configResolved(config) {
        Object.assign(process.env, loadEnv(config.mode, config.root, 'API_FOOTBALL_'))
    },
    configureServer(server) {
        server.middlewares.use('/api/sports', sportsMiddleware)
    },
    configurePreviewServer(server) {
        server.middlewares.use('/api/sports', sportsMiddleware)
    },
}

async function sportsMiddleware(req, res, next) {
    const kind = { '/matches': 'matches', '/match': 'match' }[req.url.split('?')[0]]
    if (!kind) return next()
    const response = await handleSportsApi(new Request(new URL(req.originalUrl, 'http://localhost')), kind)
    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.end(await response.text())
}

export default defineConfig({
    plugins: [react(), sportsApi],
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
