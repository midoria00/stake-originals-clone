import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TEMPLATES } from './scripts/accounts/emailTemplates.mjs'
import { templatePatch } from './scripts/accounts/pushEmailTemplates.mjs'

// The pt-BR Auth e-mails must keep working behind the protected previews and with the app routes:
// token_hash in the query (fragments are lost at the Vercel login), the route and type each API
// endpoint accepts (server/account/app.js auth/confirm and auth/reset), and only GoTrue variables.
const LINKS = {
    confirmation: ['/conta/confirmar', 'email'],
    magic_link: ['/conta/confirmar', 'email'],
    email_change: ['/conta/confirmar', 'email_change'],
    recovery: ['/conta/redefinir-senha', 'recovery'],
    invite: ['/conta/redefinir-senha', 'invite'],
}
const VARIABLES = new Set(['.SiteURL', '.TokenHash', '.Token', '.Email', '.NewEmail', '.OldEmail'])

test('the eight template files match the generator', () => {
    assert.equal(Object.keys(TEMPLATES).length, 8)
    for (const [name, { html, subject }] of Object.entries(TEMPLATES)) {
        assert.equal(readFileSync(new URL(`./supabase/templates/${name}.html`, import.meta.url), 'utf8'), html, name)
        assert.ok(subject.length > 10 && subject.includes('123bet'), name)
    }
})

test('action links carry token_hash in the query, with the route and type the API accepts', () => {
    for (const [name, [route, type]] of Object.entries(LINKS)) {
        const link = `{{ .SiteURL }}${route}?token_hash={{ .TokenHash }}&amp;type=${type}`
        const html = TEMPLATES[name].html
        assert.equal(html.split(`href="${link}"`).length - 1, 2, `${name}: button and fallback link`)
        assert.ok(!html.includes('ConfirmationURL'), `${name}: no fragment-token default link`)
    }
    assert.ok(TEMPLATES.reauthentication.html.includes('{{ .Token }}'))
    assert.ok(!/href=/.test(TEMPLATES.reauthentication.html))
})

test('templates use only GoTrue variables, no scripts and no betting promotion', () => {
    for (const [name, { html }] of Object.entries(TEMPLATES)) {
        for (const [, variable] of html.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) assert.ok(VARIABLES.has(variable), `${name}: ${variable}`)
        assert.ok(!/<script|javascript:|\son[a-z]+\s*=/i.test(html), name)
        assert.ok(html.includes('créditos fictícios, sem dinheiro real'), name)
        assert.ok(html.includes('lang="pt-BR"'), name)
    }
})

test('the Management API patch sets templates and notices only, never SMTP credentials', () => {
    const patch = templatePatch(TEMPLATES)
    const keys = Object.keys(patch)
    assert.equal(keys.length, 6 * 2 + 2 * 3)
    for (const name of Object.keys(LINKS).concat('reauthentication')) {
        assert.equal(patch[`mailer_subjects_${name}`], TEMPLATES[name].subject)
        assert.equal(patch[`mailer_templates_${name}_content`], TEMPLATES[name].html)
    }
    assert.equal(patch.mailer_notifications_password_changed_enabled, true)
    assert.equal(patch.mailer_notifications_email_changed_enabled, true)
    assert.equal(patch.mailer_templates_password_changed_notification_content, TEMPLATES.password_changed_notification.html)
    assert.equal(patch.mailer_templates_email_changed_notification_content, TEMPLATES.email_changed_notification.html)
    assert.ok(keys.every((key) => !key.startsWith('smtp_')))
    const withSender = templatePatch(TEMPLATES, { senderName: '123bet', adminEmail: 'nao-responda@auth.example.com' })
    assert.equal(withSender.smtp_sender_name, '123bet')
    assert.equal(withSender.smtp_admin_email, 'nao-responda@auth.example.com')
    assert.ok(!('smtp_pass' in withSender) && !('smtp_user' in withSender) && !('smtp_host' in withSender))
})

test('supabase/config.toml declares the same subjects and files (for supabase config push)', () => {
    const toml = readFileSync(new URL('./supabase/config.toml', import.meta.url), 'utf8')
    const section = (header) => toml.split(`[${header}]`)[1]?.split(/\n\[/)[0] ?? ''
    const sections = {
        confirmation: 'auth.email.template.confirmation', recovery: 'auth.email.template.recovery',
        email_change: 'auth.email.template.email_change', invite: 'auth.email.template.invite',
        magic_link: 'auth.email.template.magic_link', reauthentication: 'auth.email.template.reauthentication',
        password_changed_notification: 'auth.email.notification.password_changed',
        email_changed_notification: 'auth.email.notification.email_changed',
    }
    for (const [name, header] of Object.entries(sections)) {
        const body = section(header)
        assert.ok(body.includes(`subject = "${TEMPLATES[name].subject}"`), name)
        assert.ok(body.includes(`content_path = "./supabase/templates/${name}.html"`), name)
        if (header.includes('notification')) assert.ok(body.includes('enabled = true'), name)
    }
    assert.ok(!/^\[auth\.email\.smtp\]/m.test(toml), 'SMTP credentials stay out of the repository config')
})
