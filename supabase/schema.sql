-- Global leaderboard for 2048 Qubed.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- The table is not readable or writable by clients directly; everything goes through submit_score().

create table if not exists public.scores (
  player_id  text primary key,
  name       text not null,
  score      integer not null check (score >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists scores_rank_idx on public.scores (score desc, updated_at asc);

alter table public.scores enable row level security;
revoke all on table public.scores from anon, authenticated;

-- Saves p_score if it beats the player's best, then returns the player's rank and the top p_limit rows.
-- Ties are broken by who reached the score first.
create or replace function public.submit_score(p_player_id text, p_name text, p_score integer, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.scores;
  my_rank bigint;
begin
  if p_player_id is null or length(p_player_id) not between 1 and 128 then
    raise exception 'invalid player id';
  end if;
  if p_score is null or p_score < 0 or p_score > 100000000 then
    raise exception 'invalid score';
  end if;

  insert into public.scores as s (player_id, name, score)
  values (p_player_id, left(coalesce(nullif(trim(p_name), ''), 'Player'), 24), p_score)
  on conflict (player_id) do update
    set name = excluded.name,
        score = greatest(s.score, excluded.score),
        updated_at = case when excluded.score > s.score then now() else s.updated_at end
  returning * into me;

  select count(*) + 1 into my_rank
  from public.scores o
  where o.score > me.score or (o.score = me.score and o.updated_at < me.updated_at);

  return jsonb_build_object(
    'rank', my_rank,
    'best', me.score,
    'name', me.name,
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'score', t.score, 'me', t.player_id = p_player_id)
                       order by t.score desc, t.updated_at asc)
      from (
        select * from public.scores
        order by score desc, updated_at asc
        limit least(greatest(coalesce(p_limit, 100), 1), 100)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.submit_score(text, text, integer, integer) from public;
grant execute on function public.submit_score(text, text, integer, integer) to anon, authenticated;
