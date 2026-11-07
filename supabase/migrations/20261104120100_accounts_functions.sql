-- Server-side operations. Only the service role may execute these (see the security migration);
-- the API authenticates the caller and passes the user id. Every balance change locks the wallet row
-- first (lock order: wallet -> bonuses -> round/bet), so concurrent requests of one user serialize
-- and a replayed idempotency key returns the stored result instead of acting twice.
-- Errors are raised as P0001 with a stable code in the message (insufficient_funds, ...).

-- Internal helpers -------------------------------------------------------------------------------

create function public._wallet_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object('balance', w.balance, 'promoBalance', w.promo_balance, 'version', w.version, 'updatedAt', w.updated_at)
    from public.wallets w where w.user_id = p_user
$$;

create function public._lock_wallet(p_user uuid) returns public.wallets
language plpgsql set search_path = '' as $$
declare w public.wallets;
begin
    select * into w from public.wallets where user_id = p_user for update;
    if not found then
        raise exception 'wallet_not_found' using errcode = 'P0001';
    end if;
    return w;
end $$;

-- Applies one ledger movement to a locked wallet and returns the ledger row.
create function public._post(
    p_user uuid, p_type text, p_main bigint, p_promo bigint, p_origin text,
    p_ref_type text default null, p_ref_id uuid default null, p_idem text default null, p_meta jsonb default '{}'::jsonb
) returns public.wallet_transactions
language plpgsql set search_path = '' as $$
declare
    v_balance bigint;
    v_promo bigint;
    tx public.wallet_transactions;
begin
    update public.wallets
       set balance = balance + p_main, promo_balance = promo_balance + p_promo, version = version + 1, updated_at = now()
     where user_id = p_user
    returning balance, promo_balance into v_balance, v_promo;
    if not found then
        raise exception 'wallet_not_found' using errcode = 'P0001';
    end if;
    insert into public.wallet_transactions (user_id, type, amount, promo_amount, balance_after, promo_balance_after, origin, reference_type, reference_id, idempotency_key, metadata)
    values (p_user, p_type, p_main, p_promo, v_balance, v_promo, p_origin, p_ref_type, p_ref_id, p_idem, coalesce(p_meta, '{}'::jsonb))
    returning * into tx;
    return tx;
exception when check_violation then
    raise exception 'insufficient_funds' using errcode = 'P0001';
end $$;

-- Promo credits expire with their bonus; the remainder leaves the promo balance.
create function public._expire_bonuses(p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare b record;
begin
    for b in
        select id, remaining from public.bonuses
         where user_id = p_user and status = 'active' and expires_at <= now()
         order by expires_at for update
    loop
        update public.bonuses set status = 'expired', remaining = 0 where id = b.id;
        if b.remaining > 0 then
            perform public._post(p_user, 'bonus_expired', 0, -b.remaining, 'system', 'bonus', b.id);
        end if;
    end loop;
end $$;

-- Spends promo credits first (oldest expiry first), then the main balance.
create function public._debit_stake(p_user uuid, p_stake bigint, p_origin text, p_ref_type text, p_ref_id uuid)
returns public.wallet_transactions
language plpgsql set search_path = '' as $$
declare
    w public.wallets;
    v_promo bigint;
    v_left bigint;
    b record;
begin
    if p_stake is null or p_stake <= 0 then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    select * into w from public.wallets where user_id = p_user;
    v_promo := least(p_stake, w.promo_balance);
    if p_stake - v_promo > w.balance then
        raise exception 'insufficient_funds' using errcode = 'P0001';
    end if;
    v_left := v_promo;
    for b in
        select id, remaining from public.bonuses
         where user_id = p_user and status = 'active' and remaining > 0
         order by expires_at, granted_at for update
    loop
        exit when v_left <= 0;
        update public.bonuses
           set remaining = remaining - least(v_left, b.remaining),
               status = case when remaining - least(v_left, b.remaining) = 0 then 'consumed' else status end
         where id = b.id;
        v_left := v_left - least(v_left, b.remaining);
    end loop;
    return public._post(p_user, 'bet', -(p_stake - v_promo), -v_promo, p_origin, p_ref_type, p_ref_id);
end $$;

create function public._round_json(r public.game_rounds) returns jsonb
language sql immutable set search_path = '' as $$
    select jsonb_build_object(
        'id', r.id, 'game', r.game, 'status', r.status, 'stake', r.stake, 'payout', r.payout,
        'multiplierBp', r.multiplier_bp, 'params', r.params, 'state', r.state, 'result', r.result,
        'step', r.step, 'createdAt', r.created_at, 'settledAt', r.settled_at)
$$;

create function public._require_role(p_actor uuid, p_roles text[]) returns text
language plpgsql stable set search_path = '' as $$
declare v_role text;
begin
    select role into v_role from public.profiles where id = p_actor;
    if v_role is null or not (v_role = any (p_roles)) then
        raise exception 'forbidden' using errcode = 'P0001';
    end if;
    return v_role;
end $$;

create function public._mask_email(p_email text) returns text
language sql immutable set search_path = '' as $$
    select case
        when p_email is null or position('@' in p_email) < 2 then null
        else left(p_email, 1) || repeat('*', greatest(position('@' in p_email) - 2, 1)) || substr(p_email, position('@' in p_email))
    end
$$;

-- Account ----------------------------------------------------------------------------------------

create function public.account_summary(p_user uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
    p public.profiles;
    s public.user_settings;
begin
    select * into p from public.profiles where id = p_user;
    if not found then
        raise exception 'profile_not_found' using errcode = 'P0001';
    end if;
    perform public._lock_wallet(p_user);
    perform public._expire_bonuses(p_user);
    select * into s from public.user_settings where user_id = p_user;
    return jsonb_build_object(
        'profile', jsonb_build_object('id', p.id, 'username', p.username, 'fullName', p.full_name, 'role', p.role,
            'termsVersion', p.terms_version, 'privacyVersion', p.privacy_version, 'createdAt', p.created_at),
        'settings', jsonb_build_object('hideBalance', s.hide_balance, 'reducedMotion', s.reduced_motion, 'sound', s.sound,
            'sessionReminderMinutes', s.session_reminder_minutes),
        'wallet', public._wallet_json(p_user),
        'bonuses', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'amount', b.amount, 'remaining', b.remaining,
                'expiresAt', b.expires_at, 'conditions', b.conditions) order by b.expires_at)
            from public.bonuses b where b.user_id = p_user and b.status = 'active'), '[]'::jsonb));
end $$;

create function public.update_profile(p_user uuid, p_full_name text) returns jsonb
language plpgsql set search_path = '' as $$
begin
    if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 80 then
        raise exception 'invalid_full_name' using errcode = 'P0001';
    end if;
    update public.profiles set full_name = btrim(p_full_name), updated_at = now() where id = p_user;
    if not found then
        raise exception 'profile_not_found' using errcode = 'P0001';
    end if;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id)
    values (p_user, 'user', 'profile.updated', p_user, 'profile', p_user::text);
    return public.account_summary(p_user);
end $$;

create function public.update_settings(p_user uuid, p_settings jsonb) returns jsonb
language plpgsql set search_path = '' as $$
begin
    if jsonb_typeof(p_settings) <> 'object' then
        raise exception 'invalid_settings' using errcode = 'P0001';
    end if;
    update public.user_settings set
        hide_balance = case when jsonb_typeof(p_settings -> 'hideBalance') = 'boolean' then (p_settings ->> 'hideBalance')::boolean else hide_balance end,
        reduced_motion = case when jsonb_typeof(p_settings -> 'reducedMotion') = 'boolean' then (p_settings ->> 'reducedMotion')::boolean else reduced_motion end,
        sound = case when jsonb_typeof(p_settings -> 'sound') = 'boolean' then (p_settings ->> 'sound')::boolean else sound end,
        session_reminder_minutes = case when jsonb_typeof(p_settings -> 'sessionReminderMinutes') = 'number'
            then (p_settings ->> 'sessionReminderMinutes')::int else session_reminder_minutes end,
        updated_at = now()
    where user_id = p_user;
    return public.account_summary(p_user);
exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_settings' using errcode = 'P0001';
end $$;

-- Free credits (same rules as the visitor wallet: fixed amounts, ceiling of 100,000 coins) --------

create function public.claim_free_credits(p_user uuid, p_amount bigint, p_idem text) returns jsonb
language plpgsql set search_path = '' as $$
declare
    w public.wallets;
    tx public.wallet_transactions;
begin
    w := public._lock_wallet(p_user);
    select * into tx from public.wallet_transactions where user_id = p_user and idempotency_key = p_idem;
    if found then
        return jsonb_build_object('transaction', to_jsonb(tx), 'wallet', public._wallet_json(p_user), 'replayed', true);
    end if;
    if p_amount is null or not (p_amount = any (array[10000, 50000, 100000, 500000]::bigint[])) then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    if w.balance + p_amount > 10000000 then
        raise exception 'ceiling_reached' using errcode = 'P0001';
    end if;
    tx := public._post(p_user, 'free_credit', p_amount, 0, 'wallet', null, null, p_idem);
    return jsonb_build_object('transaction', to_jsonb(tx), 'wallet', public._wallet_json(p_user), 'replayed', false);
end $$;

-- Game rounds ------------------------------------------------------------------------------------

-- Single-request games (dice, limbo, plinko): the API resolves the outcome with a server RNG and
-- this records stake, payout and round atomically.
create function public.play_instant_round(
    p_user uuid, p_game text, p_stake bigint, p_payout bigint, p_multiplier_bp bigint,
    p_params jsonb, p_result jsonb, p_idem text
) returns jsonb
language plpgsql set search_path = '' as $$
declare r public.game_rounds;
begin
    perform public._lock_wallet(p_user);
    select * into r from public.game_rounds where user_id = p_user and idempotency_key = p_idem;
    if found then
        return jsonb_build_object('round', public._round_json(r), 'wallet', public._wallet_json(p_user), 'replayed', true);
    end if;
    if p_game not in ('dice', 'limbo', 'plinko') then
        raise exception 'invalid_game' using errcode = 'P0001';
    end if;
    if p_stake is null or p_stake < 10 or p_stake > 1000000 or p_payout is null or p_payout < 0 then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    perform public._expire_bonuses(p_user);
    insert into public.game_rounds (user_id, game, status, stake, payout, multiplier_bp, params, result, idempotency_key, settled_at)
    values (p_user, p_game, 'settled', p_stake, p_payout, p_multiplier_bp, coalesce(p_params, '{}'), coalesce(p_result, '{}'), p_idem, now())
    returning * into r;
    perform public._debit_stake(p_user, p_stake, p_game, 'game_round', r.id);
    if p_payout > 0 then
        perform public._post(p_user, 'win', p_payout, 0, p_game, 'game_round', r.id);
    end if;
    return jsonb_build_object('round', public._round_json(r), 'wallet', public._wallet_json(p_user), 'replayed', false);
end $$;

-- Interactive games (mines, crash, dino): the stake leaves the wallet when the round opens.
create function public.open_round(
    p_user uuid, p_game text, p_stake bigint, p_params jsonb, p_state jsonb, p_secret jsonb, p_idem text
) returns jsonb
language plpgsql set search_path = '' as $$
declare r public.game_rounds;
begin
    perform public._lock_wallet(p_user);
    select * into r from public.game_rounds where user_id = p_user and idempotency_key = p_idem;
    if found then
        return jsonb_build_object('round', public._round_json(r), 'secret', r.secret, 'wallet', public._wallet_json(p_user), 'replayed', true);
    end if;
    if p_game not in ('mines', 'crash', 'dino') then
        raise exception 'invalid_game' using errcode = 'P0001';
    end if;
    if p_stake is null or p_stake < 10 or p_stake > 1000000 then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.game_rounds where user_id = p_user and game = p_game and status = 'open') then
        raise exception 'round_already_open' using errcode = 'P0001';
    end if;
    perform public._expire_bonuses(p_user);
    insert into public.game_rounds (user_id, game, status, stake, params, state, secret, idempotency_key)
    values (p_user, p_game, 'open', p_stake, coalesce(p_params, '{}'), coalesce(p_state, '{}'), coalesce(p_secret, '{}'), p_idem)
    returning * into r;
    perform public._debit_stake(p_user, p_stake, p_game, 'game_round', r.id);
    return jsonb_build_object('round', public._round_json(r), 'secret', r.secret, 'wallet', public._wallet_json(p_user), 'replayed', false);
end $$;

-- Server-only read (includes the secret). The API never forwards the secret of an open round.
create function public.get_round(p_user uuid, p_round uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r public.game_rounds;
begin
    select * into r from public.game_rounds where id = p_round and user_id = p_user;
    if not found then
        raise exception 'round_not_found' using errcode = 'P0001';
    end if;
    return jsonb_build_object('round', public._round_json(r), 'secret', r.secret);
end $$;

create function public.get_open_round(p_user uuid, p_game text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r public.game_rounds;
begin
    select * into r from public.game_rounds where user_id = p_user and game = p_game and status = 'open';
    if not found then
        return null;
    end if;
    return jsonb_build_object('round', public._round_json(r), 'secret', r.secret);
end $$;

-- Compare-and-set progress of an open round (e.g. a revealed tile). A stale step means a parallel
-- request already advanced the round.
create function public.round_step(p_user uuid, p_round uuid, p_expected_step int, p_state jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r public.game_rounds;
begin
    update public.game_rounds set state = p_state, step = step + 1
     where id = p_round and user_id = p_user and status = 'open' and step = p_expected_step
    returning * into r;
    if not found then
        raise exception 'round_conflict' using errcode = 'P0001';
    end if;
    return jsonb_build_object('round', public._round_json(r));
end $$;

-- Closes an open round once. Repeating the call returns the settled round without paying again.
create function public.settle_round(
    p_user uuid, p_round uuid, p_payout bigint, p_multiplier_bp bigint, p_result jsonb, p_expected_step int default null
) returns jsonb
language plpgsql set search_path = '' as $$
declare r public.game_rounds;
begin
    perform public._lock_wallet(p_user);
    select * into r from public.game_rounds where id = p_round and user_id = p_user for update;
    if not found then
        raise exception 'round_not_found' using errcode = 'P0001';
    end if;
    if r.status = 'settled' then
        return jsonb_build_object('round', public._round_json(r), 'wallet', public._wallet_json(p_user), 'replayed', true);
    end if;
    if p_expected_step is not null and r.step <> p_expected_step then
        raise exception 'round_conflict' using errcode = 'P0001';
    end if;
    if p_payout is null or p_payout < 0 or p_payout > r.stake * 1000000 then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    update public.game_rounds
       set status = 'settled', payout = p_payout, multiplier_bp = p_multiplier_bp, result = coalesce(p_result, '{}'), settled_at = now()
     where id = p_round
    returning * into r;
    if p_payout > 0 then
        perform public._post(p_user, 'win', p_payout, 0, r.game, 'game_round', r.id);
    end if;
    return jsonb_build_object('round', public._round_json(r), 'wallet', public._wallet_json(p_user), 'replayed', false);
end $$;

-- Simulated sports bets --------------------------------------------------------------------------

create function public._bet_json(b public.sports_bets) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object(
        'id', b.id, 'kind', b.kind, 'stake', b.stake, 'oddsBp', b.odds_bp, 'potentialPayout', b.potential_payout,
        'status', b.status, 'payout', b.payout, 'dataSource', b.data_source, 'createdAt', b.created_at, 'settledAt', b.settled_at,
        'selections', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'matchId', s.match_id, 'matchLabel', s.match_label,
                'market', s.market, 'selection', s.selection, 'line', s.line, 'selectionLabel', s.selection_label, 'oddsBp', s.odds_bp,
                'status', s.status, 'result', s.result) order by s.match_id)
            from public.bet_selections s where s.bet_id = b.id), '[]'::jsonb))
$$;

create function public.place_sports_bet(
    p_user uuid, p_kind text, p_stake bigint, p_odds_bp bigint, p_potential bigint, p_source text, p_selections jsonb, p_idem text
) returns jsonb
language plpgsql set search_path = '' as $$
declare
    b public.sports_bets;
    n int := jsonb_array_length(coalesce(p_selections, '[]'::jsonb));
begin
    perform public._lock_wallet(p_user);
    select * into b from public.sports_bets where user_id = p_user and idempotency_key = p_idem;
    if found then
        return jsonb_build_object('bet', public._bet_json(b), 'wallet', public._wallet_json(p_user), 'replayed', true);
    end if;
    if p_stake is null or p_stake < 10 or p_stake > 1000000 then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    if n < 1 or n > 20 or (p_kind = 'single' and n <> 1) or (p_kind = 'multiple' and n < 2) then
        raise exception 'invalid_selections' using errcode = 'P0001';
    end if;
    perform public._expire_bonuses(p_user);
    insert into public.sports_bets (user_id, kind, stake, odds_bp, potential_payout, data_source, idempotency_key)
    values (p_user, p_kind, p_stake, p_odds_bp, p_potential, p_source, p_idem)
    returning * into b;
    insert into public.bet_selections (bet_id, match_id, match_label, market, selection, line, selection_label, odds_bp)
    select b.id, s ->> 'matchId', s ->> 'matchLabel', s ->> 'market', s ->> 'selection', (s ->> 'line')::numeric, s ->> 'selectionLabel', (s ->> 'oddsBp')::bigint
      from jsonb_array_elements(p_selections) s;
    perform public._debit_stake(p_user, p_stake, 'sports', 'sports_bet', b.id);
    return jsonb_build_object('bet', public._bet_json(b), 'wallet', public._wallet_json(p_user), 'replayed', false);
exception when unique_violation or check_violation or not_null_violation or invalid_text_representation then
    raise exception 'invalid_selections' using errcode = 'P0001';
end $$;

-- p_selections: [{ "id": "<selection uuid>", "status": "won|lost|void|half_won|half_lost", "result": {...} }]
create function public.settle_sports_bet(p_bet uuid, p_status text, p_payout bigint, p_selections jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
    v_user uuid;
    b public.sports_bets;
begin
    select user_id into v_user from public.sports_bets where id = p_bet;
    if v_user is null then
        raise exception 'bet_not_found' using errcode = 'P0001';
    end if;
    perform public._lock_wallet(v_user);
    select * into b from public.sports_bets where id = p_bet for update;
    if b.status <> 'open' then
        return jsonb_build_object('bet', public._bet_json(b), 'replayed', true);
    end if;
    if p_status not in ('won', 'lost', 'void', 'partial') or p_payout is null or p_payout < 0 or p_payout > b.potential_payout
       or (p_status = 'lost' and p_payout <> 0) or (p_status = 'void' and p_payout <> b.stake)
       or (p_status = 'partial' and (p_payout = 0 or p_payout >= b.stake)) then
        raise exception 'invalid_settlement' using errcode = 'P0001';
    end if;
    update public.bet_selections s
       set status = x.status, result = coalesce(x.result, '{}')
      from jsonb_to_recordset(coalesce(p_selections, '[]'::jsonb)) as x(id uuid, status text, result jsonb)
     where s.id = x.id and s.bet_id = p_bet;
    update public.sports_bets set status = p_status, payout = p_payout, settled_at = now() where id = p_bet returning * into b;
    if p_payout > 0 then
        perform public._post(v_user, case when p_status = 'void' then 'refund' else 'win' end, p_payout, 0, 'sports', 'sports_bet', p_bet);
    end if;
    return jsonb_build_object('bet', public._bet_json(b), 'replayed', false);
end $$;

create function public.open_sports_bets(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
    select coalesce(jsonb_agg(public._bet_json(b) order by b.created_at), '[]'::jsonb)
      from public.sports_bets b where b.user_id = p_user and b.status = 'open'
$$;

-- History ----------------------------------------------------------------------------------------

create function public.list_transactions(
    p_user uuid, p_types text[] default null, p_origins text[] default null,
    p_from timestamptz default null, p_to timestamptz default null, p_cursor bigint default null, p_limit int default 25
) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
    v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
    items jsonb;
begin
    select coalesce(jsonb_agg(to_jsonb(t) order by t.seq desc), '[]'::jsonb) into items
      from (
        select * from public.wallet_transactions
         where user_id = p_user
           and (p_types is null or type = any (p_types))
           and (p_origins is null or origin = any (p_origins))
           and (p_from is null or created_at >= p_from)
           and (p_to is null or created_at < p_to)
           and (p_cursor is null or seq < p_cursor)
         order by seq desc
         limit v_limit + 1
      ) t;
    return jsonb_build_object('items', coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(items) with ordinality a(e, i) where i <= v_limit) x), '[]'::jsonb),
                              'hasMore', jsonb_array_length(items) > v_limit);
end $$;

create function public.list_rounds(
    p_user uuid, p_game text default null, p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit int default 25
) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
    v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
    items jsonb;
begin
    select coalesce(jsonb_agg(public._round_json(r) order by r.created_at desc, r.id desc), '[]'::jsonb) into items
      from (
        select * from public.game_rounds
         where user_id = p_user and (p_game is null or game = p_game)
           and (p_cursor_at is null or (created_at, id) < (p_cursor_at, p_cursor_id))
         order by created_at desc, id desc
         limit v_limit + 1
      ) r;
    return jsonb_build_object('items', coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(items) with ordinality a(e, i) where i <= v_limit) x), '[]'::jsonb),
                              'hasMore', jsonb_array_length(items) > v_limit);
end $$;

create function public.list_sports_bets(
    p_user uuid, p_status text default null, p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit int default 25
) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
    v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
    items jsonb;
begin
    select coalesce(jsonb_agg(public._bet_json(b) order by b.created_at desc, b.id desc), '[]'::jsonb) into items
      from (
        select * from public.sports_bets
         where user_id = p_user and (p_status is null or status = p_status)
           and (p_cursor_at is null or (created_at, id) < (p_cursor_at, p_cursor_id))
         order by created_at desc, id desc
         limit v_limit + 1
      ) b;
    return jsonb_build_object('items', coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(items) with ordinality a(e, i) where i <= v_limit) x), '[]'::jsonb),
                              'hasMore', jsonb_array_length(items) > v_limit);
end $$;

create function public.game_stats(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object(
        'games', coalesce((select jsonb_agg(jsonb_build_object('game', g.game, 'rounds', g.rounds, 'wagered', g.wagered, 'returned', g.returned,
                'net', g.returned - g.wagered, 'biggestPayout', g.biggest, 'wins', g.wins) order by g.game)
            from (select game, count(*) as rounds, sum(stake) as wagered, sum(payout) as returned, max(payout) as biggest,
                         count(*) filter (where payout > stake) as wins
                    from public.game_rounds where user_id = p_user and status = 'settled' group by game) g), '[]'::jsonb),
        'sports', (select jsonb_build_object('bets', count(*), 'wagered', coalesce(sum(stake), 0), 'returned', coalesce(sum(payout), 0),
                'open', count(*) filter (where status = 'open'), 'won', count(*) filter (where status = 'won'))
            from public.sports_bets where user_id = p_user),
        'freeCredits', (select coalesce(sum(amount), 0) from public.wallet_transactions where user_id = p_user and type = 'free_credit'),
        'bonusCredits', (select coalesce(sum(promo_amount), 0) from public.wallet_transactions where user_id = p_user and type = 'bonus'))
$$;

-- Promotions -------------------------------------------------------------------------------------

create function public._grant_bonus(p_user uuid, p_kind text, p_amount bigint, p_days int, p_conditions text, p_origin text)
returns public.bonuses
language plpgsql set search_path = '' as $$
declare b public.bonuses;
begin
    insert into public.bonuses (user_id, kind, amount, remaining, conditions, expires_at)
    values (p_user, p_kind, p_amount, p_amount, p_conditions, now() + make_interval(days => p_days))
    returning * into b;
    perform public._post(p_user, 'bonus', 0, p_amount, p_origin, 'bonus', b.id);
    return b;
end $$;

create function public.coupon_redeem(p_user uuid, p_code text) returns jsonb
language plpgsql set search_path = '' as $$
declare
    c public.coupons;
    v_used int;
    b public.bonuses;
begin
    perform public._lock_wallet(p_user);
    select * into c from public.coupons where code = upper(btrim(coalesce(p_code, ''))) for update;
    -- One message for unknown, inactive and expired codes: codes cannot be probed.
    if not found or not c.active or now() < c.valid_from or now() >= c.valid_until then
        raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;
    if c.redemptions >= c.max_redemptions then
        raise exception 'coupon_exhausted' using errcode = 'P0001';
    end if;
    select count(*) into v_used from public.coupon_redemptions where coupon_id = c.id and user_id = p_user;
    if v_used >= c.per_user_limit then
        raise exception 'coupon_already_redeemed' using errcode = 'P0001';
    end if;
    b := public._grant_bonus(p_user, 'coupon', c.amount, c.bonus_days,
        'Créditos promocionais fictícios do cupom ' || c.code || '. Usados antes do saldo comum, não podem ser sacados e expiram em ' || c.bonus_days || ' dias.',
        'coupon');
    insert into public.coupon_redemptions (coupon_id, user_id, use_number, bonus_id) values (c.id, p_user, v_used + 1, b.id);
    update public.coupons set redemptions = redemptions + 1 where id = c.id;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id, details)
    values (p_user, 'user', 'coupon.redeemed', p_user, 'coupon', c.id::text, jsonb_build_object('code', c.code, 'amount', c.amount));
    return jsonb_build_object('bonus', to_jsonb(b), 'wallet', public._wallet_json(p_user));
end $$;

create function public.list_promotions(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object(
        'bonuses', coalesce((select jsonb_agg(to_jsonb(b) order by b.granted_at desc) from (
            select * from public.bonuses where user_id = p_user order by granted_at desc limit 50) b), '[]'::jsonb),
        'redemptions', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'code', c.code, 'description', c.description,
                'amount', c.amount, 'createdAt', r.created_at) order by r.created_at desc)
            from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id where r.user_id = p_user), '[]'::jsonb))
$$;

-- Weekly cashback: 1% of the coins wagered last week (Monday to Sunday, Brasília time), from 1 coin
-- up to 500 coins, as promo credits valid for 7 days. Based on volume, never on losses.
create function public._cashback_week(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
    with bounds as (
        select (date_trunc('week', now() at time zone 'America/Sao_Paulo') - interval '7 days')::date as week_start
    ), wagered as (
        select coalesce(sum(-(t.amount + t.promo_amount)), 0)::bigint as total
          from public.wallet_transactions t, bounds
         where t.user_id = p_user and t.type = 'bet'
           and t.created_at >= (bounds.week_start::timestamp at time zone 'America/Sao_Paulo')
           and t.created_at < ((bounds.week_start + 7)::timestamp at time zone 'America/Sao_Paulo')
    )
    select jsonb_build_object('weekStart', bounds.week_start, 'wagered', wagered.total,
        'amount', case when wagered.total / 100 >= 100 then least(wagered.total / 100, 50000) else 0 end,
        'rateBp', 100, 'minimum', 100, 'cap', 50000,
        'claimed', exists (select 1 from public.cashback_claims c where c.user_id = p_user and c.week_start = bounds.week_start))
      from bounds, wagered
$$;

create function public.cashback_status(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
    select public._cashback_week(p_user) || jsonb_build_object('history', coalesce((
        select jsonb_agg(jsonb_build_object('weekStart', c.week_start, 'wagered', c.wagered, 'amount', c.amount, 'createdAt', c.created_at)
               order by c.week_start desc)
          from public.cashback_claims c where c.user_id = p_user), '[]'::jsonb))
$$;

create function public.cashback_claim(p_user uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
    wk jsonb;
    b public.bonuses;
begin
    perform public._lock_wallet(p_user);
    wk := public._cashback_week(p_user);
    if (wk ->> 'claimed')::boolean then
        raise exception 'cashback_already_claimed' using errcode = 'P0001';
    end if;
    if (wk ->> 'amount')::bigint <= 0 then
        raise exception 'cashback_unavailable' using errcode = 'P0001';
    end if;
    b := public._grant_bonus(p_user, 'cashback', (wk ->> 'amount')::bigint, 7,
        'Cashback demonstrativo de 1% do volume apostado na semana, em créditos fictícios. Não pode ser sacado e expira em 7 dias.',
        'cashback');
    insert into public.cashback_claims (user_id, week_start, wagered, amount, bonus_id)
    values (p_user, (wk ->> 'weekStart')::date, (wk ->> 'wagered')::bigint, (wk ->> 'amount')::bigint, b.id);
    return public.cashback_status(p_user) || jsonb_build_object('wallet', public._wallet_json(p_user));
end $$;

-- Payment sandbox --------------------------------------------------------------------------------

create function public.payment_create(
    p_user uuid, p_method text, p_amount_cents bigint, p_provider_ref text, p_ttl_seconds int, p_idem text
) returns jsonb
language plpgsql set search_path = '' as $$
declare a public.payment_attempts;
begin
    select * into a from public.payment_attempts where user_id = p_user and idempotency_key = p_idem;
    if found then
        return jsonb_build_object('attempt', to_jsonb(a), 'replayed', true);
    end if;
    if (select count(*) from public.payment_attempts where user_id = p_user and status = 'pending' and expires_at > now()) >= 5 then
        raise exception 'too_many_pending' using errcode = 'P0001';
    end if;
    if p_ttl_seconds is null or p_ttl_seconds not between 60 and 3600 then
        raise exception 'invalid_ttl' using errcode = 'P0001';
    end if;
    insert into public.payment_attempts (user_id, provider, provider_ref, method, amount_cents, expires_at, idempotency_key)
    values (p_user, 'sandbox', p_provider_ref, p_method, p_amount_cents, now() + make_interval(secs => p_ttl_seconds), p_idem)
    returning * into a;
    return jsonb_build_object('attempt', to_jsonb(a), 'replayed', false);
exception when check_violation then
    raise exception 'invalid_payment' using errcode = 'P0001';
end $$;

create function public.payment_get(p_user uuid, p_attempt uuid) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object('attempt', to_jsonb(a), 'events', coalesce((
            select jsonb_agg(jsonb_build_object('eventId', e.event_id, 'type', e.type, 'outcome', e.outcome, 'detail', e.detail, 'receivedAt', e.received_at)
                   order by e.received_at)
              from public.payment_events e where e.attempt_id = a.id), '[]'::jsonb))
      from public.payment_attempts a where a.id = p_attempt and a.user_id = p_user
$$;

create function public.list_payments(p_user uuid, p_limit int default 20) returns jsonb
language sql stable set search_path = '' as $$
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.payment_attempts where user_id = p_user
            order by created_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) a
$$;

-- Records a verified webhook event once and applies the state transition it describes. Wallets are
-- never touched: sandbox payments do not create balances or withdrawal rights.
create function public.payment_record_event(
    p_provider text, p_event_id text, p_provider_ref text, p_type text, p_payload jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
    a public.payment_attempts;
    v_target text := case p_type
        when 'payment.confirmed' then 'confirmed' when 'payment.failed' then 'failed'
        when 'payment.cancelled' then 'cancelled' when 'payment.expired' then 'expired'
        when 'payment.refunded' then 'refunded' end;
    v_outcome text;
    v_detail text;
begin
    select * into a from public.payment_attempts where provider = p_provider and provider_ref = p_provider_ref for update;
    if exists (select 1 from public.payment_events where provider = p_provider and event_id = p_event_id) then
        return jsonb_build_object('outcome', 'duplicate');
    end if;
    if a.id is null then
        v_outcome := 'rejected'; v_detail := 'unknown_reference';
    elsif v_target is null then
        v_outcome := 'rejected'; v_detail := 'unknown_type';
    elsif (a.status = 'pending' and v_target in ('confirmed', 'failed', 'cancelled', 'expired'))
       or (a.status = 'confirmed' and v_target = 'refunded') then
        if a.status = 'pending' and v_target = 'confirmed' and a.expires_at <= now() then
            v_outcome := 'ignored'; v_detail := 'attempt_expired';
        else
            update public.payment_attempts set status = v_target, updated_at = now() where id = a.id;
            v_outcome := 'applied'; v_detail := a.status || '->' || v_target;
        end if;
    else
        v_outcome := 'ignored'; v_detail := 'invalid_transition:' || a.status || '->' || v_target;
    end if;
    insert into public.payment_events (provider, event_id, attempt_id, type, payload, outcome, detail)
    values (p_provider, p_event_id, a.id, p_type, coalesce(p_payload, '{}'), v_outcome, v_detail);
    return jsonb_build_object('outcome', v_outcome, 'detail', v_detail, 'attemptId', a.id);
exception when unique_violation then
    return jsonb_build_object('outcome', 'duplicate');
end $$;

-- Reconciliation: expires overdue attempts through the same event path and reports attempts whose
-- status disagrees with the last applied event.
create function public.payment_reconcile() returns jsonb
language plpgsql set search_path = '' as $$
declare
    a record;
    v_expired int := 0;
begin
    for a in select provider, provider_ref, id from public.payment_attempts where status = 'pending' and expires_at <= now() loop
        perform public.payment_record_event(a.provider, 'reconcile:' || a.id::text || ':expired', a.provider_ref, 'payment.expired', '{"source":"reconciliation"}');
        v_expired := v_expired + 1;
    end loop;
    return jsonb_build_object('expired', v_expired, 'mismatches', coalesce((
        select jsonb_agg(jsonb_build_object('attemptId', x.id, 'status', x.status, 'lastEvent', x.last_type))
          from (
            select pa.id, pa.status, (
                select e.type from public.payment_events e
                 where e.attempt_id = pa.id and e.outcome = 'applied' order by e.received_at desc limit 1) as last_type
              from public.payment_attempts pa
          ) x
         where (x.last_type is null and x.status <> 'pending')
            or (x.last_type is not null and 'payment.' || x.status <> x.last_type)), '[]'::jsonb),
        'checkedAt', now());
end $$;

-- Test-only withdrawals --------------------------------------------------------------------------

create function public.withdrawal_create(p_actor uuid, p_amount_cents bigint, p_note text) returns jsonb
language plpgsql set search_path = '' as $$
declare
    v_role text := public._require_role(p_actor, array['support', 'admin']);
    w public.withdrawal_requests;
begin
    insert into public.withdrawal_requests (user_id, amount_cents, note) values (p_actor, p_amount_cents, nullif(btrim(p_note), ''))
    returning * into w;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id, details)
    values (p_actor, v_role, 'withdrawal.test_created', p_actor, 'withdrawal', w.id::text, jsonb_build_object('amountCents', w.amount_cents));
    return to_jsonb(w);
exception when check_violation then
    raise exception 'invalid_withdrawal' using errcode = 'P0001';
end $$;

create function public.withdrawal_transition(p_actor uuid, p_id uuid, p_to text, p_note text) returns jsonb
language plpgsql set search_path = '' as $$
declare
    v_role text := public._require_role(p_actor, array['support', 'admin']);
    w public.withdrawal_requests;
    v_from text;
begin
    select * into w from public.withdrawal_requests where id = p_id for update;
    if not found then
        raise exception 'withdrawal_not_found' using errcode = 'P0001';
    end if;
    v_from := w.status;
    if not ((v_from = 'requested' and p_to in ('in_review', 'rejected', 'cancelled'))
         or (v_from = 'in_review' and p_to in ('approved', 'rejected', 'cancelled'))
         or (v_from = 'approved' and p_to in ('completed', 'cancelled'))) then
        raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    if p_to in ('approved', 'completed', 'rejected') and v_role <> 'admin' then
        raise exception 'forbidden' using errcode = 'P0001';
    end if;
    update public.withdrawal_requests set status = p_to, note = coalesce(nullif(btrim(p_note), ''), note), updated_at = now()
     where id = p_id returning * into w;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id, details)
    values (p_actor, v_role, 'withdrawal.test_transition', w.user_id, 'withdrawal', w.id::text, jsonb_build_object('from', v_from, 'to', p_to));
    return to_jsonb(w);
end $$;

-- Administration (every function checks the actor's role). The two that read auth.users run as the
-- migration owner, because the service role cannot read the auth schema directly.

create function public.admin_users(p_actor uuid, p_query text default null, p_offset int default 0, p_limit int default 25) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(x order by x ->> 'createdAt' desc) from (
        select jsonb_build_object('id', p.id, 'username', p.username, 'fullName', p.full_name, 'role', p.role,
                   'email', public._mask_email(u.email), 'confirmed', u.email_confirmed_at is not null,
                   'balance', w.balance, 'promoBalance', w.promo_balance, 'createdAt', p.created_at) as x
          from public.profiles p
          join auth.users u on u.id = p.id
          join public.wallets w on w.user_id = p.id
         where p_query is null or p.username ilike '%' || p_query || '%' or p.full_name ilike '%' || p_query || '%'
         order by p.created_at desc
         offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 25), 1), 100)) s), '[]'::jsonb);
end $$;

create function public.admin_user_detail(p_actor uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_role text := public._require_role(p_actor, array['support', 'admin']);
    v_email text;
begin
    select u.email into v_email from auth.users u join public.profiles p on p.id = u.id where u.id = p_user;
    if not found then
        raise exception 'user_not_found' using errcode = 'P0001';
    end if;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id)
    values (p_actor, v_role, 'admin.user_viewed', p_user, 'profile', p_user::text);
    return public.account_summary(p_user) || jsonb_build_object(
        'email', case when v_role = 'admin' then v_email else public._mask_email(v_email) end,
        'stats', public.game_stats(p_user),
        'transactions', public.list_transactions(p_user, null, null, null, null, null, 20) -> 'items',
        'rounds', public.list_rounds(p_user, null, null, null, 10) -> 'items',
        'sportsBets', public.list_sports_bets(p_user, null, null, null, 10) -> 'items',
        'payments', public.list_payments(p_user, 10));
end $$;

create function public.admin_transactions(p_actor uuid, p_user uuid default null, p_type text default null, p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('username', p.username) order by t.seq desc)
      from (select * from public.wallet_transactions
             where (p_user is null or user_id = p_user) and (p_type is null or type = p_type)
             order by seq desc
             offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)) t
      join public.profiles p on p.id = t.user_id), '[]'::jsonb);
end $$;

create function public.admin_payment_events(p_actor uuid, p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'eventId', e.event_id, 'type', e.type, 'outcome', e.outcome,
            'detail', e.detail, 'receivedAt', e.received_at, 'attemptId', e.attempt_id, 'attemptStatus', a.status,
            'amountCents', a.amount_cents, 'username', p.username) order by e.received_at desc)
      from (select * from public.payment_events order by received_at desc
             offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)) e
      left join public.payment_attempts a on a.id = e.attempt_id
      left join public.profiles p on p.id = a.user_id), '[]'::jsonb);
end $$;

create function public.admin_errors(p_actor uuid, p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from (select * from public.app_errors order by created_at desc
             offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)) e), '[]'::jsonb);
end $$;

create function public.admin_audit(p_actor uuid, p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc, l.id desc)
      from (select * from public.audit_logs order by created_at desc, id desc
             offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)) l), '[]'::jsonb);
end $$;

create function public.admin_metrics(p_actor uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return jsonb_build_object(
        'users', (select count(*) from public.profiles),
        'usersLast7Days', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
        'coinsInWallets', (select coalesce(sum(balance), 0) from public.wallets),
        'promoInWallets', (select coalesce(sum(promo_balance), 0) from public.wallets),
        'transactions24h', (select count(*) from public.wallet_transactions where created_at > now() - interval '24 hours'),
        'rounds24h', coalesce((select jsonb_object_agg(game, n) from (select game, count(*) n from public.game_rounds
            where created_at > now() - interval '24 hours' group by game) g), '{}'::jsonb),
        'openSportsBets', (select count(*) from public.sports_bets where status = 'open'),
        'payments', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.payment_attempts group by status) s), '{}'::jsonb),
        'withdrawals', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.withdrawal_requests group by status) s), '{}'::jsonb),
        'errors24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
        'ledgerCheck', (select count(*) from public.wallets w where w.balance <> coalesce((select sum(t.amount) from public.wallet_transactions t where t.user_id = w.user_id), 0)
                                                          or w.promo_balance <> coalesce((select sum(t.promo_amount) from public.wallet_transactions t where t.user_id = w.user_id), 0)));
end $$;

-- Manual balance corrections only through this audited operation (never a direct UPDATE).
create function public.admin_adjust_wallet(p_actor uuid, p_user uuid, p_amount bigint, p_reason text, p_idem text) returns jsonb
language plpgsql set search_path = '' as $$
declare tx public.wallet_transactions;
begin
    perform public._require_role(p_actor, array['admin']);
    if p_actor = p_user then
        raise exception 'self_adjustment_forbidden' using errcode = 'P0001';
    end if;
    if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end if;
    if p_reason is null or char_length(btrim(p_reason)) not between 10 and 200 then
        raise exception 'invalid_reason' using errcode = 'P0001';
    end if;
    perform public._lock_wallet(p_user);
    select * into tx from public.wallet_transactions where user_id = p_user and idempotency_key = p_idem;
    if found then
        return jsonb_build_object('transaction', to_jsonb(tx), 'replayed', true);
    end if;
    tx := public._post(p_user, 'admin_adjustment', p_amount, 0, 'admin', 'admin_action', null, p_idem,
        jsonb_build_object('reason', btrim(p_reason), 'actorId', p_actor));
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id, details)
    values (p_actor, 'admin', 'admin.wallet_adjusted', p_user, 'wallet_transaction', tx.id::text,
        jsonb_build_object('amount', p_amount, 'reason', btrim(p_reason)));
    return jsonb_build_object('transaction', to_jsonb(tx), 'replayed', false);
end $$;

create function public.admin_coupons(p_actor uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.coupons c), '[]'::jsonb);
end $$;

-- p_data: { code, description, amount, bonusDays, maxRedemptions, perUserLimit, validFrom, validUntil, active }
create function public.admin_coupon_upsert(p_actor uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare c public.coupons;
begin
    perform public._require_role(p_actor, array['admin']);
    insert into public.coupons (code, description, amount, bonus_days, max_redemptions, per_user_limit, valid_from, valid_until, active, created_by)
    values (upper(btrim(p_data ->> 'code')), btrim(p_data ->> 'description'), (p_data ->> 'amount')::bigint,
            coalesce((p_data ->> 'bonusDays')::int, 7), (p_data ->> 'maxRedemptions')::int, coalesce((p_data ->> 'perUserLimit')::int, 1),
            coalesce((p_data ->> 'validFrom')::timestamptz, now()), (p_data ->> 'validUntil')::timestamptz,
            coalesce((p_data ->> 'active')::boolean, true), p_actor)
    on conflict (code) do update set
        description = excluded.description, amount = excluded.amount, bonus_days = excluded.bonus_days,
        max_redemptions = excluded.max_redemptions, per_user_limit = excluded.per_user_limit,
        valid_from = excluded.valid_from, valid_until = excluded.valid_until, active = excluded.active
    returning * into c;
    insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
    values (p_actor, 'admin', 'admin.coupon_saved', 'coupon', c.id::text, to_jsonb(c) - 'created_by');
    return to_jsonb(c);
exception when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'invalid_coupon' using errcode = 'P0001';
end $$;

create function public.admin_withdrawals(p_actor uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
    perform public._require_role(p_actor, array['support', 'admin']);
    return coalesce((select jsonb_agg(to_jsonb(w) || jsonb_build_object('username', p.username) order by w.created_at desc)
      from (select * from public.withdrawal_requests order by created_at desc limit 200) w
      join public.profiles p on p.id = w.user_id), '[]'::jsonb);
end $$;

-- Audit, errors, rate limits, maintenance --------------------------------------------------------

create function public.audit_log(
    p_actor uuid, p_role text, p_action text, p_target_user uuid default null, p_target_type text default null,
    p_target_id text default null, p_details jsonb default '{}'::jsonb, p_ip_hash text default null
) returns void
language sql set search_path = '' as $$
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id, details, ip_hash)
    values (p_actor, p_role, p_action, p_target_user, p_target_type, p_target_id, coalesce(p_details, '{}'), p_ip_hash)
$$;

create function public.log_error(p_route text, p_code text, p_message text, p_request_id text default null) returns void
language sql set search_path = '' as $$
    insert into public.app_errors (route, code, message, request_id) values (left(p_route, 120), left(p_code, 60), left(p_message, 500), left(p_request_id, 80))
$$;

-- Fixed window counter shared by every function instance (unlike an in-memory limiter).
create function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns jsonb
language plpgsql set search_path = '' as $$
declare
    v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
    v_hits int;
begin
    insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_window, 1)
    on conflict (key) do update
        set hits = case when r.window_start = excluded.window_start then r.hits + 1 else 1 end,
            window_start = excluded.window_start
    returning hits into v_hits;
    return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits,
        'retryAfter', greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::int));
end $$;

-- Retention: rate-limit counters 1 day, technical errors 30 days, audit log 1 year.
create function public.purge_expired() returns jsonb
language plpgsql set search_path = '' as $$
declare v_rl int; v_err int; v_audit int;
begin
    delete from public.rate_limits where window_start < now() - interval '1 day';
    get diagnostics v_rl = row_count;
    delete from public.app_errors where created_at < now() - interval '30 days';
    get diagnostics v_err = row_count;
    delete from public.audit_logs where created_at < now() - interval '365 days';
    get diagnostics v_audit = row_count;
    return jsonb_build_object('rateLimits', v_rl, 'errors', v_err, 'auditLogs', v_audit, 'payments', public.payment_reconcile());
end $$;

-- Privacy (LGPD) ---------------------------------------------------------------------------------

create function public.export_user_data(p_user uuid) returns jsonb
language plpgsql set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles where id = p_user) then
        raise exception 'profile_not_found' using errcode = 'P0001';
    end if;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id)
    values (p_user, 'user', 'privacy.exported', p_user, 'profile', p_user::text);
    return jsonb_build_object(
        'exportedAt', now(),
        'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user),
        'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = p_user),
        'wallet', (select to_jsonb(w) - 'user_id' from public.wallets w where w.user_id = p_user),
        'transactions', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.seq) from public.wallet_transactions t where t.user_id = p_user), '[]'::jsonb),
        'gameRounds', coalesce((select jsonb_agg(public._round_json(r) order by r.created_at) from public.game_rounds r where r.user_id = p_user), '[]'::jsonb),
        'sportsBets', coalesce((select jsonb_agg(public._bet_json(b) order by b.created_at) from public.sports_bets b where b.user_id = p_user), '[]'::jsonb),
        'payments', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at) from public.payment_attempts a where a.user_id = p_user), '[]'::jsonb),
        'withdrawals', coalesce((select jsonb_agg(to_jsonb(w) - 'user_id' order by w.created_at) from public.withdrawal_requests w where w.user_id = p_user), '[]'::jsonb),
        'bonuses', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by b.granted_at) from public.bonuses b where b.user_id = p_user), '[]'::jsonb),
        'couponRedemptions', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at) from public.coupon_redemptions c where c.user_id = p_user), '[]'::jsonb),
        'cashbackClaims', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at) from public.cashback_claims c where c.user_id = p_user), '[]'::jsonb),
        'auditLog', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at) order by l.created_at)
            from public.audit_logs l where l.target_user_id = p_user), '[]'::jsonb));
end $$;

-- Deletes every row tied to the account. The API then deletes the Supabase Auth user (e-mail and
-- password hash). Audit entries keep only the pseudonymous id until their retention ends.
create function public.erase_user_data(p_user uuid) returns jsonb
language plpgsql set search_path = '' as $$
begin
    perform set_config('app.erasure', 'on', true);
    delete from public.profiles where id = p_user;
    if not found then
        raise exception 'profile_not_found' using errcode = 'P0001';
    end if;
    update public.audit_logs set ip_hash = null where target_user_id = p_user or actor_id = p_user;
    insert into public.audit_logs (actor_id, actor_role, action, target_user_id, target_type, target_id)
    values (p_user, 'user', 'privacy.erased', p_user, 'profile', p_user::text);
    perform set_config('app.erasure', 'off', true);
    return jsonb_build_object('erased', true);
end $$;

create function public.username_available(p_username text) returns boolean
language sql stable set search_path = '' as $$
    select not exists (select 1 from public.profiles where username = lower(p_username))
$$;

create function public.get_role(p_user uuid) returns text
language sql stable set search_path = '' as $$
    select role from public.profiles where id = p_user
$$;
