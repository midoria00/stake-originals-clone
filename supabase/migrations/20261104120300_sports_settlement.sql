-- Settlement sweep for the maintenance cron: open simulated sports bets across all players,
-- oldest first. Service role only (the API calls it after authenticating the cron secret).

create function public.open_sports_bets_all(p_limit int default 200) returns jsonb
language sql stable set search_path = '' as $$
    select coalesce(jsonb_agg(public._bet_json(b) order by b.created_at, b.id), '[]'::jsonb)
      from (
        select * from public.sports_bets
         where status = 'open'
         order by created_at, id
         limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) b
$$;

revoke execute on function public.open_sports_bets_all(int) from public, anon, authenticated;
grant execute on function public.open_sports_bets_all(int) to service_role;

-- A replayed bet request must return the original bet even after the odds moved or the match
-- started, so the API looks the idempotency key up before it validates the selections.
create function public.find_sports_bet_by_key(p_user uuid, p_idem text) returns jsonb
language sql stable set search_path = '' as $$
    select jsonb_build_object('bet', public._bet_json(b), 'wallet', public._wallet_json(p_user), 'replayed', true)
      from public.sports_bets b where b.user_id = p_user and b.idempotency_key = p_idem
$$;

revoke execute on function public.find_sports_bet_by_key(uuid, text) from public, anon, authenticated;
grant execute on function public.find_sports_bet_by_key(uuid, text) to service_role;
