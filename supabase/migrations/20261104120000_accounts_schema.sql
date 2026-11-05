-- 123bet accounts: profiles, settings, wallet ledger, games, simulated sports bets, payment sandbox,
-- test-only withdrawals, promotions, audit and rate limits.
--
-- Amounts of 123 Coins are bigint "cents" (1 coin = 100). 123 Coins are fictional credits with no
-- monetary value: they cannot be bought, sold, withdrawn or converted. Payment and withdrawal tables
-- belong to a sandbox and never touch a wallet.

-- Profiles ---------------------------------------------------------------------------------------

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
    full_name text not null check (char_length(full_name) between 2 and 80),
    role text not null default 'user' check (role in ('user', 'support', 'admin')),
    terms_version text,
    terms_accepted_at timestamptz,
    privacy_version text,
    privacy_accepted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.user_settings (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    hide_balance boolean not null default false,
    reduced_motion boolean not null default false,
    sound boolean not null default true,
    session_reminder_minutes int not null default 0 check (session_reminder_minutes in (0, 15, 30, 60, 120)),
    updated_at timestamptz not null default now()
);

-- Wallet and ledger ------------------------------------------------------------------------------

create table public.wallets (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    balance bigint not null default 0 check (balance >= 0),
    promo_balance bigint not null default 0 check (promo_balance >= 0),
    currency text not null default 'COIN' check (currency = 'COIN'),
    version bigint not null default 0,
    updated_at timestamptz not null default now()
);

-- Append-only: every balance change is one row, written in the same transaction as the wallet update.
create table public.wallet_transactions (
    id uuid primary key default gen_random_uuid(),
    seq bigint generated always as identity unique,  -- strict order, also within one transaction
    user_id uuid not null references public.profiles (id) on delete cascade,
    type text not null check (type in ('welcome', 'free_credit', 'bet', 'win', 'refund', 'bonus', 'bonus_expired', 'admin_adjustment')),
    amount bigint not null,
    promo_amount bigint not null default 0,
    balance_after bigint not null check (balance_after >= 0),
    promo_balance_after bigint not null check (promo_balance_after >= 0),
    status text not null default 'posted' check (status = 'posted'),
    origin text not null check (origin in ('wallet', 'crash', 'plinko', 'mines', 'dino', 'dice', 'limbo', 'sports', 'coupon', 'cashback', 'admin', 'system')),
    reference_type text check (reference_type in ('game_round', 'sports_bet', 'bonus', 'admin_action')),
    reference_id uuid,
    idempotency_key text check (char_length(idempotency_key) between 8 and 100),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    check (amount <> 0 or promo_amount <> 0),
    unique (user_id, idempotency_key)
);
create index wallet_transactions_user_seq on public.wallet_transactions (user_id, seq desc);
create index wallet_transactions_user_type on public.wallet_transactions (user_id, type, created_at desc);
create index wallet_transactions_reference on public.wallet_transactions (reference_type, reference_id);

-- Games ------------------------------------------------------------------------------------------

create table public.game_rounds (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    game text not null check (game in ('crash', 'plinko', 'mines', 'dino', 'dice', 'limbo')),
    status text not null check (status in ('open', 'settled')),
    stake bigint not null check (stake > 0),
    payout bigint not null default 0 check (payout >= 0),
    multiplier_bp bigint check (multiplier_bp >= 0),  -- multiplier x 10,000
    params jsonb not null default '{}'::jsonb,         -- what the player chose
    state jsonb not null default '{}'::jsonb,          -- public progress (e.g. revealed tiles)
    secret jsonb not null default '{}'::jsonb,         -- server-only (mine positions, crash point); never sent before settlement
    result jsonb not null default '{}'::jsonb,
    step int not null default 0,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
    created_at timestamptz not null default now(),
    settled_at timestamptz,
    unique (user_id, idempotency_key),
    check ((status = 'settled') = (settled_at is not null))
);
create index game_rounds_user_created on public.game_rounds (user_id, created_at desc, id desc);
create index game_rounds_user_game on public.game_rounds (user_id, game, created_at desc);
-- Interactive games allow one open round per player and game: no parallel rounds to race.
create unique index game_rounds_one_open on public.game_rounds (user_id, game) where status = 'open';

-- Simulated sports bets --------------------------------------------------------------------------

create table public.sports_bets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null check (kind in ('single', 'multiple')),
    stake bigint not null check (stake > 0),
    odds_bp bigint not null check (odds_bp >= 10000),  -- combined odds x 10,000
    potential_payout bigint not null check (potential_payout >= stake),
    status text not null default 'open' check (status in ('open', 'won', 'lost', 'void', 'partial')),  -- partial: 0 < payout < stake (half-lost lines)
    payout bigint not null default 0 check (payout >= 0),
    data_source text not null check (data_source in ('api-football', 'demo')),
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
    created_at timestamptz not null default now(),
    settled_at timestamptz,
    unique (user_id, idempotency_key),
    check ((status = 'open') = (settled_at is null))
);
create index sports_bets_user_created on public.sports_bets (user_id, created_at desc, id desc);
create index sports_bets_open on public.sports_bets (status) where status = 'open';

create table public.bet_selections (
    id uuid primary key default gen_random_uuid(),
    bet_id uuid not null references public.sports_bets (id) on delete cascade,
    match_id text not null check (char_length(match_id) between 1 and 40),
    match_label text not null check (char_length(match_label) between 1 and 160),
    market text not null check (char_length(market) between 1 and 60),
    selection text not null check (char_length(selection) between 1 and 80),
    selection_label text not null check (char_length(selection_label) between 1 and 160),
    odds_bp bigint not null check (odds_bp > 10000),
    line numeric(6, 2),
    status text not null default 'open' check (status in ('open', 'won', 'lost', 'void', 'half_won', 'half_lost')),
    result jsonb not null default '{}'::jsonb,
    unique (bet_id, match_id)
);
create index bet_selections_match on public.bet_selections (match_id) where status = 'open';

-- Payment sandbox (no real money; never credits a wallet) ----------------------------------------

create table public.payment_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    provider text not null check (provider in ('sandbox')),
    provider_ref text not null,
    method text not null check (method in ('pix_simulado', 'cartao_simulado')),
    amount_cents bigint not null check (amount_cents between 100 and 100000),  -- fictitious BRL, display only
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed', 'cancelled', 'expired', 'refunded')),
    expires_at timestamptz not null,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (provider, provider_ref),
    unique (user_id, idempotency_key)
);
create index payment_attempts_user_created on public.payment_attempts (user_id, created_at desc, id desc);
create index payment_attempts_pending on public.payment_attempts (expires_at) where status = 'pending';

create table public.payment_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null check (provider in ('sandbox')),
    event_id text not null check (char_length(event_id) between 8 and 100),
    attempt_id uuid references public.payment_attempts (id) on delete cascade,
    type text not null,
    payload jsonb not null default '{}'::jsonb,
    outcome text not null check (outcome in ('applied', 'ignored', 'rejected')),
    detail text,
    received_at timestamptz not null default now(),
    unique (provider, event_id)
);
create index payment_events_attempt on public.payment_events (attempt_id, received_at);
create index payment_events_received on public.payment_events (received_at desc);

-- Withdrawals: internal test state machine only. No payout rail exists. -------------------------

create table public.withdrawal_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    amount_cents bigint not null check (amount_cents between 100 and 100000),  -- fictitious BRL
    status text not null default 'requested' check (status in ('requested', 'in_review', 'approved', 'rejected', 'cancelled', 'completed')),
    test_only boolean not null default true check (test_only),
    note text check (char_length(note) <= 300),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index withdrawal_requests_user on public.withdrawal_requests (user_id, created_at desc);

-- Promotions: bonuses (promo credits), coupons, cashback -----------------------------------------

create table public.bonuses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    kind text not null check (kind in ('coupon', 'cashback', 'admin')),
    amount bigint not null check (amount > 0),
    remaining bigint not null check (remaining >= 0 and remaining <= amount),
    status text not null default 'active' check (status in ('active', 'consumed', 'expired')),
    conditions text not null check (char_length(conditions) between 10 and 400),
    expires_at timestamptz not null,
    granted_at timestamptz not null default now()
);
create index bonuses_user_active on public.bonuses (user_id, expires_at) where status = 'active';

create table public.coupons (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (code ~ '^[A-Z0-9_-]{4,24}$'),
    description text not null check (char_length(description) between 4 and 200),
    amount bigint not null check (amount > 0 and amount <= 1000000),
    bonus_days int not null default 7 check (bonus_days between 1 and 90),
    max_redemptions int not null check (max_redemptions between 1 and 1000000),
    per_user_limit int not null default 1 check (per_user_limit between 1 and 10),
    redemptions int not null default 0 check (redemptions >= 0 and redemptions <= max_redemptions),
    valid_from timestamptz not null default now(),
    valid_until timestamptz not null,
    active boolean not null default true,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    check (valid_until > valid_from)
);

create table public.coupon_redemptions (
    id uuid primary key default gen_random_uuid(),
    coupon_id uuid not null references public.coupons (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    use_number int not null check (use_number >= 1),
    bonus_id uuid not null references public.bonuses (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (coupon_id, user_id, use_number)
);
create index coupon_redemptions_user on public.coupon_redemptions (user_id, created_at desc);

-- Weekly cashback on wagered volume (never on losses).
create table public.cashback_claims (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    week_start date not null,
    wagered bigint not null check (wagered >= 0),
    amount bigint not null check (amount > 0),
    bonus_id uuid not null references public.bonuses (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (user_id, week_start)
);

-- Audit, errors, rate limits ---------------------------------------------------------------------

-- No foreign keys: entries outlive an erased account and keep only pseudonymous ids.
create table public.audit_logs (
    id bigint generated always as identity primary key,
    actor_id uuid,
    actor_role text not null check (actor_role in ('user', 'support', 'admin', 'system')),
    action text not null check (char_length(action) between 3 and 60),
    target_user_id uuid,
    target_type text,
    target_id text,
    details jsonb not null default '{}'::jsonb,
    ip_hash text,
    created_at timestamptz not null default now()
);
create index audit_logs_created on public.audit_logs (created_at desc);
create index audit_logs_target on public.audit_logs (target_user_id, created_at desc);
create index audit_logs_actor on public.audit_logs (actor_id, created_at desc);

create table public.app_errors (
    id bigint generated always as identity primary key,
    route text not null,
    code text not null,
    message text not null check (char_length(message) <= 500),
    request_id text,
    created_at timestamptz not null default now()
);
create index app_errors_created on public.app_errors (created_at desc);

create table public.rate_limits (
    key text primary key check (char_length(key) <= 200),
    window_start timestamptz not null,
    hits int not null
);

-- Ledger and history guards ----------------------------------------------------------------------

-- Ledger rows, payment events and audit entries are never rewritten. Changing them is allowed only
-- inside erase_user_data (LGPD erasure), which sets app.erasure for its own transaction.
create function public.guard_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
    if coalesce(current_setting('app.erasure', true), '') = 'on' then
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    raise exception 'append_only: % on % is not allowed', tg_op, tg_table_name using errcode = 'P0001';
end $$;

create trigger wallet_transactions_append_only before update or delete on public.wallet_transactions
    for each row execute function public.guard_append_only();
create trigger payment_events_append_only before update or delete on public.payment_events
    for each row execute function public.guard_append_only();
create trigger audit_logs_append_only before update on public.audit_logs
    for each row execute function public.guard_append_only();

create function public.guard_settled_round() returns trigger
language plpgsql set search_path = '' as $$
begin
    if old.status = 'settled' then
        raise exception 'round_settled' using errcode = 'P0001';
    end if;
    if new.user_id <> old.user_id or new.game <> old.game or new.stake <> old.stake or new.idempotency_key <> old.idempotency_key then
        raise exception 'round_immutable' using errcode = 'P0001';
    end if;
    return new;
end $$;
create trigger game_rounds_guard before update on public.game_rounds
    for each row execute function public.guard_settled_round();

-- New auth user -> profile, settings, wallet with the welcome credit (1,000 coins). --------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
    wanted text := lower(coalesce(meta ->> 'username', ''));
    uname text;
    fname text := btrim(coalesce(meta ->> 'full_name', ''));
begin
    if wanted !~ '^[a-z0-9_]{3,20}$' then
        wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
    end if;
    uname := wanted;
    -- Username taken between the availability check and the sign-up: keep the account, add a suffix.
    if exists (select 1 from public.profiles where username = uname) then
        uname := left(wanted, 15) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
    end if;
    if char_length(fname) < 2 or char_length(fname) > 80 then
        fname := 'Jogador 123bet';
    end if;

    insert into public.profiles (id, username, full_name, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at)
    values (
        new.id, uname, fname,
        nullif(meta ->> 'terms_version', ''), case when meta ? 'terms_version' then now() end,
        nullif(meta ->> 'privacy_version', ''), case when meta ? 'privacy_version' then now() end
    );
    insert into public.user_settings (user_id) values (new.id);
    insert into public.wallets (user_id, balance) values (new.id, 100000);
    insert into public.wallet_transactions (user_id, type, amount, balance_after, promo_balance_after, origin, idempotency_key, metadata)
    values (new.id, 'welcome', 100000, 100000, 0, 'system', 'welcome:' || new.id::text, '{"note":"Créditos iniciais fictícios"}');
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id)
    values (new.id, 'user', 'account.created', new.id, 'profile', new.id::text);
    return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
