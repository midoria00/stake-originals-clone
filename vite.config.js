import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig({
    plugins: [react()],
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
