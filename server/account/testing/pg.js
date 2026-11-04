// Test/dev only: runs the Supabase migrations in PGlite (Postgres compiled to WASM) with the few
// Supabase pieces they rely on (roles, auth.users, auth.uid()). Never used by the deployed API.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;
create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb,
    created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
`

export async function createTestDatabase() {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite()
    await db.exec(SUPABASE_STUB)
    for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
        await db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'))
    }
    return db
}

function literal(value) {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError('non-finite number')
        return String(value)
    }
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    const text = Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? `{${value.map((item) => `"${item.replace(/["\\]/g, '\\$&')}"`).join(',')}}`
        : typeof value === 'object' ? JSON.stringify(value) : String(value)
    if (text.includes('\0')) throw new TypeError('NUL byte')
    return `'${text.replace(/'/g, "''")}'`
}

// Calls a function the way PostgREST's /rpc does (named arguments), as the given role.
export async function callRpc(db, name, args = {}, role = 'service_role') {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new TypeError('bad function name')
    const named = Object.entries(args).map(([key, value]) => {
        if (!/^p_[a-z0-9_]+$/.test(key)) throw new TypeError(`bad argument ${key}`)
        return `${key} => ${literal(value)}`
    })
    await db.exec(`set role ${role}`)
    try {
        const result = await db.query(`select public.${name}(${named.join(', ')}) as value`)
        return result.rows[0]?.value ?? null
    } finally {
        await db.exec('reset role')
    }
}

// Simulates Supabase Auth creating a confirmed user (fires the on_auth_user_created trigger).
export async function createAuthUser(db, { email, username, fullName = 'Jogador Teste', confirmed = true }) {
    const meta = { username, full_name: fullName, terms_version: '2026-11-04', privacy_version: '2026-11-04' }
    const result = await db.query(
        'insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3::jsonb) returning id',
        [email, confirmed ? new Date().toISOString() : null, JSON.stringify(meta)],
    )
    return result.rows[0].id
}

export async function asUser(db, userId, sql) {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
    try {
        return await db.query(sql)
    } finally {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
    }
}
