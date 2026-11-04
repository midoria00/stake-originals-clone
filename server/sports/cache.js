// Per-instance cache with in-flight dedupe. The shared layer is the CDN (Cache-Control in http.js);
// this one stops concurrent requests on a warm instance from each hitting the provider.
const MAX_ENTRIES = 500
const STALE_MS = 10 * 60 * 1000

const store = new Map()

export async function memo(key, ttlMs, load) {
    const hit = store.get(key)
    if (hit?.pending) return hit.pending
    if (hit && 'value' in hit && hit.expires > Date.now()) return hit.value

    const pending = load().then(
        (value) => {
            store.delete(key)
            store.set(key, { value, expires: Date.now() + ttlMs })
            return value
        },
        (error) => {
            // Provider down or quota exhausted: keep serving the last good answer for a while.
            if (hit && 'value' in hit && Date.now() - hit.expires < STALE_MS) {
                store.set(key, { value: hit.value, expires: hit.expires })
                return hit.value
            }
            store.delete(key)
            throw error
        },
    )
    store.set(key, { ...hit, pending })
    if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value)
    return pending
}

export function clearCache() {
    store.clear()
}
