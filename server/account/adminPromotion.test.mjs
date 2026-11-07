// The first-admin procedure documented in docs/accounts.md ("Criar o primeiro administrador") is run
// verbatim against the real migrations: it must promote only a confirmed account picked by UUID,
// write the audit entry in the same statement, and do nothing when repeated or misdirected.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAuthUser, createTestDatabase } from './testing/pg.js'

const docs = readFileSync(new URL('../../docs/accounts.md', import.meta.url), 'utf8')
const blocks = [...docs.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1].replace(/^ {6}/gm, ''))
const LOOKUP = blocks.find((sql) => sql.includes('from auth.users u join public.profiles p'))
const PROMOTE = blocks.find((sql) => sql.includes('with promoted as'))

let db
let owner
let unconfirmed
let other

const run = async (sql, values) => (await db.query(sql.replaceAll(`'<${Object.keys(values)[0]}>'`, `'${Object.values(values)[0]}'`))).rows
const staff = async () => (await db.query("select id, role from public.profiles where role <> 'user' order by id")).rows
const audits = async () => (await db.query("select actor_id, actor_role, target_user_id, target_id, details from public.audit_logs where action = 'admin.role_changed'")).rows

before(async () => {
    db = await createTestDatabase()
    owner = await createAuthUser(db, { email: 'Dono@Example.com', username: 'dono' })
    unconfirmed = await createAuthUser(db, { email: 'pendente@example.com', username: 'pendente', confirmed: false })
    other = await createAuthUser(db, { email: 'outro@example.com', username: 'outro' })
})

after(() => db.close())

test('the documented SQL blocks exist', () => {
    assert.ok(LOOKUP && PROMOTE)
    assert.ok(PROMOTE.includes("where id = '<uuid>'") && !/username|like|ilike/i.test(PROMOTE))
})

test('lookup by e-mail shows the exact UUID and confirmation state', async () => {
    const rows = await run(LOOKUP, { 'e-mail': 'dono@example.com' })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, owner)
    assert.ok(rows[0].email_confirmed_at)
    assert.equal(rows[0].role, 'user')
})

test('an account whose e-mail is not confirmed is not promoted', async () => {
    assert.deepEqual(await run(PROMOTE, { uuid: unconfirmed }), [])
    assert.deepEqual(await staff(), [])
    assert.deepEqual(await audits(), [])
})

test('promotion by UUID changes only that account and records the audit entry', async () => {
    const rows = await run(PROMOTE, { uuid: owner })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].action, 'admin.role_changed')
    assert.equal(rows[0].target_user_id, owner)
    assert.deepEqual(await staff(), [{ id: owner, role: 'admin' }])
    const [entry] = await audits()
    assert.equal(entry.actor_role, 'system')
    assert.equal(entry.actor_id, null)
    assert.equal(entry.target_id, owner)
    assert.deepEqual(entry.details, { from: 'user', to: 'admin', via: 'sql_editor' })
})

test('repeating it, or an unknown UUID, changes nothing and writes no audit entry', async () => {
    assert.deepEqual(await run(PROMOTE, { uuid: owner }), [])
    assert.deepEqual(await run(PROMOTE, { uuid: '00000000-0000-4000-8000-000000000000' }), [])
    assert.equal((await audits()).length, 1)
    assert.deepEqual(await staff(), [{ id: owner, role: 'admin' }])
    assert.equal((await db.query('select role from public.profiles where id = $1', [other])).rows[0].role, 'user')
})
