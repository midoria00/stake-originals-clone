import { handleAdmin } from '../../server/casino/admin.js'
import { createCasinoService, loadCatalog } from '../../server/casino/service.js'

const catalog = loadCatalog()
const service = createCasinoService({ catalog })

export function GET(request) {
    return handleAdmin(request, { service, catalog })
}
