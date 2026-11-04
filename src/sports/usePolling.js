import { useEffect, useRef, useState } from 'react'

// Loads now, then every `intervalMs` while the tab is visible (0 = no polling).
// The interval can change between renders without restarting the request cycle.
export function usePolling(load, intervalMs, deps) {
    const [state, setState] = useState({ data: null, error: null, loading: true })
    const [nonce, setNonce] = useState(0)
    const intervalRef = useRef(intervalMs)
    const loadRef = useRef(load)
    intervalRef.current = intervalMs
    loadRef.current = load

    useEffect(() => {
        let cancelled = false
        let timer = null
        let controller = null
        setState({ data: null, error: null, loading: true })

        const run = async () => {
            clearTimeout(timer)
            controller?.abort()
            controller = new AbortController()
            try {
                const data = await loadRef.current(controller.signal)
                if (!cancelled) setState({ data, error: null, loading: false })
            } catch (error) {
                if (!cancelled && error.name !== 'AbortError') setState((previous) => ({ ...previous, error, loading: false }))
            }
            if (!cancelled && intervalRef.current) timer = setTimeout(() => !document.hidden && run(), intervalRef.current)
        }
        const onVisibility = () => !document.hidden && run()

        run()
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            cancelled = true
            clearTimeout(timer)
            controller?.abort()
            document.removeEventListener('visibilitychange', onVisibility)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce])

    return { ...state, reload: () => setNonce((n) => n + 1) }
}
