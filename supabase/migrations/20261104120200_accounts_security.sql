-- Access control. The browser never talks to the database: the 123bet API authenticates the session
-- and calls the functions above with the service role. As defense in depth, Row Level Security is
-- on for every table, signed-in users may only read their own rows (never write), anonymous users
-- read nothing, and no function is executable by anon or authenticated.

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.game_rounds enable row level security;
alter table public.sports_bets enable row level security;
alter table public.bet_selections enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.bonuses enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.cashback_claims enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_errors enable row level security;
alter table public.rate_limits enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.user_settings, public.wallets, public.wallet_transactions, public.sports_bets,
    public.bet_selections, public.payment_attempts, public.withdrawal_requests, public.bonuses,
    public.coupon_redemptions, public.cashback_claims to authenticated;
-- Every column except "secret" (mine positions, crash point of open rounds).
grant select (id, user_id, game, status, stake, payout, multiplier_bp, params, state, result, step, idempotency_key, created_at, settled_at)
    on public.game_rounds to authenticated;

create policy profiles_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy user_settings_own on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy wallets_own on public.wallets for select to authenticated using (user_id = (select auth.uid()));
create policy wallet_transactions_own on public.wallet_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy game_rounds_own on public.game_rounds for select to authenticated using (user_id = (select auth.uid()));
create policy sports_bets_own on public.sports_bets for select to authenticated using (user_id = (select auth.uid()));
create policy bet_selections_own on public.bet_selections for select to authenticated
    using (exists (select 1 from public.sports_bets b where b.id = bet_id and b.user_id = (select auth.uid())));
create policy payment_attempts_own on public.payment_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy withdrawal_requests_own on public.withdrawal_requests for select to authenticated using (user_id = (select auth.uid()));
create policy bonuses_own on public.bonuses for select to authenticated using (user_id = (select auth.uid()));
create policy coupon_redemptions_own on public.coupon_redemptions for select to authenticated using (user_id = (select auth.uid()));
create policy cashback_claims_own on public.cashback_claims for select to authenticated using (user_id = (select auth.uid()));
-- coupons, payment_events, audit_logs, app_errors, rate_limits: no policy, so no direct access.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Functions of this schema only: Supabase's own event-trigger function (rls_auto_enable) keeps its
-- privileges. Trigger functions are not callable directly, so they get no grant.
do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as signature, p.prorettype = 'trigger'::regtype as is_trigger
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'event_trigger'::regtype
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
        if not f.is_trigger then
            execute format('grant execute on function %s to service_role', f.signature);
        end if;
    end loop;
end $$;

-- Objects created later in this schema start closed too (Supabase's default gives anon and
-- authenticated TRUNCATE/REFERENCES/TRIGGER on new tables).
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
