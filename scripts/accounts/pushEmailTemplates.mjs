// Pushes the pt-BR Auth e-mail templates (scripts/accounts/emailTemplates.mjs) to the Supabase
// project through the Management API: the 6 auth e-mails, the 2 security notices and, optionally,
// the sender name. It never reads or writes SMTP credentials, so the SMTP connection made by the
// Resend integration stays as it is. Supabase only accepts custom templates once custom SMTP is on.
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/accounts/pushEmailTemplates.mjs [--dry-run]
//   Optional: SUPABASE_PROJECT_REF (default: project_id in supabase/config.toml),
//             SMTP_SENDER_NAME (e.g. "123bet"), SMTP_ADMIN_EMAIL (e.g. nao-responda@auth.example.com).
// Prints field names and lengths only, never the token or the SMTP password.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TEMPLATES } from './emailTemplates.mjs'

const API = 'https://api.supabase.com/v1'

// Template name in emailTemplates.mjs -> Management API field stem.
const AUTH_MAILS = ['confirmation', 'recovery', 'email_change', 'invite', 'magic_link', 'reauthentication']
const NOTICES = { password_changed_notification: 'password_changed', email_changed_notification: 'email_changed' }

export function templatePatch(templates = TEMPLATES, { senderName, adminEmail } = {}) {
    const body = {}
    for (const name of AUTH_MAILS) {
        body[`mailer_subjects_${name}`] = templates[name].subject
        body[`mailer_templates_${name}_content`] = templates[name].html
    }
    for (const [name, flag] of Object.entries(NOTICES)) {
        body[`mailer_notifications_${flag}_enabled`] = true
        body[`mailer_subjects_${name}`] = templates[name].subject
        body[`mailer_templates_${name}_content`] = templates[name].html
    }
    if (senderName) body.smtp_sender_name = senderName
    if (adminEmail) body.smtp_admin_email = adminEmail
    return body
}

async function call(ref, token, method, body) {
    const response = await fetch(`${API}/projects/${ref}/config/auth`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = { message: text.slice(0, 200) } }
    if (!response.ok) throw new Error(`${method} config/auth ${response.status}: ${data?.message ?? 'error'}`)
    return data
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const dryRun = process.argv.includes('--dry-run')
    const token = process.env.SUPABASE_ACCESS_TOKEN
    const configToml = readFileSync(fileURLToPath(new URL('../../supabase/config.toml', import.meta.url)), 'utf8')
    const ref = process.env.SUPABASE_PROJECT_REF || configToml.match(/^project_id\s*=\s*"([a-z]{20})"/m)?.[1]
    if (!token || !ref) {
        console.error('Set SUPABASE_ACCESS_TOKEN (and SUPABASE_PROJECT_REF if supabase/config.toml has no project_id).')
        process.exit(2)
    }
    const current = await call(ref, token, 'GET')
    if (!current.smtp_host) {
        console.error('Custom SMTP is not configured on this project; Supabase rejects template changes without it.')
        process.exit(1)
    }
    console.log(`SMTP host ${current.smtp_host}:${current.smtp_port}, sender "${current.smtp_sender_name ?? ''}" <${current.smtp_admin_email ?? ''}>`)
    const patch = templatePatch(TEMPLATES, { senderName: process.env.SMTP_SENDER_NAME, adminEmail: process.env.SMTP_ADMIN_EMAIL })
    const changed = Object.keys(patch).filter((key) => current[key] !== patch[key])
    for (const key of Object.keys(patch)) console.log(`${changed.includes(key) ? 'change' : 'same  '}  ${key}${typeof patch[key] === 'string' ? ` (${patch[key].length} chars)` : ` = ${patch[key]}`}`)
    if (dryRun || !changed.length) {
        console.log(dryRun ? 'dry run: nothing sent' : 'already up to date')
        process.exit(0)
    }
    await call(ref, token, 'PATCH', Object.fromEntries(changed.map((key) => [key, patch[key]])))
    const after = await call(ref, token, 'GET')
    const mismatched = Object.keys(patch).filter((key) => after[key] !== patch[key])
    if (mismatched.length) {
        console.error(`not applied: ${mismatched.join(', ')}`)
        process.exit(1)
    }
    console.log(`applied ${changed.length} fields; SMTP credentials untouched`)
}
