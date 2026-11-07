// Payment gateway layer. Providers implement one interface; only the sandbox exists, and it never
// moves money: no Pix code, no card processing, no effect on any balance.
//
// Provider interface:
//   id, label
//   createPayment({ attempt }) -> { instructions }   what the user sees for a pending attempt
//   verifyWebhook({ headers, rawBody, now }) -> event { id, type, providerRef, createdAt } or throws
// A future authorized processor is a new module with this interface plus its own secrets, enabled
// only after legal approval (docs/accounts.md).
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { ApiError } from './http.js'

export const SANDBOX_EVENT_TYPES = {
    confirm: 'payment.confirmed',
    fail: 'payment.failed',
    cancel: 'payment.cancelled',
    expire: 'payment.expired',
    refund: 'payment.refunded',
}
const TOLERANCE_SECONDS = 300

export function signSandboxEvent(secret, rawBody, timestamp) {
    const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
    return `t=${timestamp},v1=${signature}`
}

export function createSandboxProvider({ secret }) {
    if (!secret || secret.length < 32) throw new ApiError(503, 'payments_sandbox_not_configured')
    return {
        id: 'sandbox',
        label: 'Gateway de testes (sem dinheiro real)',
        createPayment: ({ attempt }) => ({
            instructions: {
                kind: attempt.method,
                // Deliberately not an EMV/BR Code payload: nothing here can be paid in a bank app.
                reference: `SANDBOX-${attempt.provider_ref.slice(4, 12).toUpperCase()}`,
                notice: 'Pagamento simulado. Nenhuma cobrança real é gerada e nenhum valor é creditado.',
            },
        }),
        buildEvent(action, attempt, now) {
            const type = SANDBOX_EVENT_TYPES[action]
            if (!type) throw new ApiError(400, 'invalid_action')
            const event = { id: `evt_${randomUUID()}`, type, providerRef: attempt.provider_ref, createdAt: new Date(now).toISOString() }
            const rawBody = JSON.stringify(event)
            const timestamp = Math.floor(now / 1000)
            return { rawBody, signature: signSandboxEvent(secret, rawBody, timestamp) }
        },
        verifyWebhook({ signature, rawBody, now }) {
            const match = /^t=(\d{10}),v1=([0-9a-f]{64})$/.exec(signature ?? '')
            if (!match) throw new ApiError(401, 'invalid_signature')
            const timestamp = Number(match[1])
            if (Math.abs(now / 1000 - timestamp) > TOLERANCE_SECONDS) throw new ApiError(401, 'stale_signature')
            const expected = Buffer.from(signSandboxEvent(secret, rawBody, timestamp).slice(-64), 'hex')
            const given = Buffer.from(match[2], 'hex')
            if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new ApiError(401, 'invalid_signature')
            let event
            try { event = JSON.parse(rawBody) } catch { throw new ApiError(400, 'invalid_json') }
            if (typeof event?.id !== 'string' || !/^evt_[0-9a-f-]{36}$/.test(event.id) || typeof event.type !== 'string' || typeof event.providerRef !== 'string') {
                throw new ApiError(400, 'invalid_event')
            }
            return event
        },
    }
}

// Applies a verified event. Replays (same event id) are reported as duplicates by the database.
export async function recordEvent(rpc, provider, event) {
    return rpc('payment_record_event', {
        p_provider: provider.id, p_event_id: event.id, p_provider_ref: event.providerRef, p_type: event.type,
        p_payload: { type: event.type, createdAt: event.createdAt ?? null },
    })
}
