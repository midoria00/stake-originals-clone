// Sessions live in two httpOnly cookies (never readable by page scripts): the short-lived Supabase
// access token and the rotating refresh token. Every request validates the access token with
// Supabase Auth; an expired one is refreshed once and new cookies are returned.
import { ApiError, parseCookies, serializeCookie } from './http.js'

export const ACCESS_COOKIE = '__Host-123bet-at'
export const REFRESH_COOKIE = '__Host-123bet-rt'
const REFRESH_MAX_AGE = 30 * 24 * 3600

export function sessionCookies(session) {
    return [
        serializeCookie(ACCESS_COOKIE, session.access_token, { maxAge: Number(session.expires_in) || 3600 }),
        serializeCookie(REFRESH_COOKIE, session.refresh_token, { maxAge: REFRESH_MAX_AGE }),
    ]
}

export const clearedCookies = () => [
    serializeCookie(ACCESS_COOKIE, '', { maxAge: 0 }),
    serializeCookie(REFRESH_COOKIE, '', { maxAge: 0 }),
]

// Only to skip a pointless round trip for an obviously expired token; validity is decided by Supabase.
function tokenExpiresAt(token) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp * 1000
    } catch {
        return 0
    }
}

const isAuthRejection = (error) => error?.status >= 400 && error.status < 500

export async function resolveSession(request, sb, now = Date.now()) {
    const cookies = parseCookies(request)
    const access = cookies[ACCESS_COOKIE]
    const refresh = cookies[REFRESH_COOKIE]
    try {
        if (access && tokenExpiresAt(access) > now + 5000) {
            try {
                const user = await sb.auth.getUser(access)
                return { user, accessToken: access, cookies: [] }
            } catch (error) {
                if (!isAuthRejection(error)) throw error
            }
        }
        if (refresh) {
            try {
                const session = await sb.auth.refresh(refresh)
                return { user: session.user, accessToken: session.access_token, cookies: sessionCookies(session) }
            } catch (error) {
                if (!isAuthRejection(error)) throw error
            }
        }
    } catch {
        throw new ApiError(503, 'auth_unavailable')
    }
    return { user: null, accessToken: null, cookies: access || refresh ? clearedCookies() : [] }
}
