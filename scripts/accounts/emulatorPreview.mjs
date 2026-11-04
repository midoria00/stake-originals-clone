// Local only: serves the built app with the accounts API running on the in-memory emulator
// (PGlite + Supabase Auth stand-in), so sign-up, wallet, games and admin can be tried without
// Supabase. Seeded logins are printed on start. Usage: npm run build && npm run preview:contas
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

process.env.ACCOUNTS_EMULATOR = '1'
const port = Number(process.env.PORT) || 4174
const server = await preview({ root: fileURLToPath(new URL('../../', import.meta.url)), preview: { port, strictPort: true, open: false } })
server.printUrls()
