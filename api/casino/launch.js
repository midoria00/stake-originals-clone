import { handle } from '../../server/casino/http.js'

export function GET(request) {
    return handle(request, 'launch')
}
