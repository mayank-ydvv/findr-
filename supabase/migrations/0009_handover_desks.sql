-- Handover through a staffed desk instead of a direct meetup.
--
-- The finder hands the item to a guard at one of two desks and marks it
-- handed in; the owner then collects it from that desk. This removes the
-- window where a found item sits with a stranger waiting for a meetup to be
-- arranged, which is the step the whole flow was failing on.
--
-- Modelled as columns on `claims` rather than a separate handovers table:
-- a handover has no life of its own — it belongs to exactly one claim, is
-- created and settled with it, and dies with it. A child table would buy
-- nothing but a join.

alter table claims
  add column if not exists dropoff_point text
    check (dropoff_point in ('university_ground', 'techpark_desk')),
  add column if not exists dropped_off_at timestamptz,
  add column if not exists collected_at timestamptz;

-- A collection cannot precede the drop-off that made it possible, and a
-- drop-off is meaningless without naming the desk. Enforced here rather
-- than only in the route, so a future writer can't skip a step.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'claims_handover_order'
  ) then
    alter table claims add constraint claims_handover_order check (
      (dropped_off_at is null) = (dropoff_point is null)
      and (collected_at is null or dropped_off_at is not null)
    );
  end if;
end $$;

-- Partial index: the "what's waiting at a desk right now" query, which is
-- the only one that scans by handover state.
create index if not exists claims_awaiting_collection_idx
  on claims (dropoff_point)
  where dropped_off_at is not null and collected_at is null;

-- Realtime on claims, so the owner sees "handed in at Tech Park" the moment
-- the finder marks it, without polling or a refresh. RLS on claims is
-- already participant-scoped (claimant_id/holder_id), so a subscriber only
-- ever receives their own rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'claims'
  ) then
    alter publication supabase_realtime add table claims;
  end if;
end $$;
