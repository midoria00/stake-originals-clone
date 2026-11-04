import { handle } from '../../server/sports/http.js'

export function GET(request) {
    return handle(request, 'matches')
}
