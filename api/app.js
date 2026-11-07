// Account API (/api/app/*, routed here by vercel.json). See server/account/app.js.
import { createAccountApp } from '../server/account/app.js'

const app = createAccountApp()
const handle = (request) => app.handle(request)

export { handle as GET, handle as POST, handle as PATCH }
