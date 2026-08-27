-- ============================================================
--  Findr — pending database changes
--  Paste this whole file into the Supabase SQL Editor and Run.
--  Safe to run more than once: every step checks itself first,
--  so re-running does nothing rather than erroring.
-- ============================================================


-- 1. Match notifications -------------------------------------
-- Lets Realtime emit change events for `matches`. RLS on that table is
-- already participant-scoped, so each user only receives their own rows.
-- Without this the toast + Matches badge silently never fire.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table matches;
  end if;
end $$;


-- 2. Optional photo on lost reports --------------------------
-- Someone who lost an item often has no picture of it. Found reports still
-- require one: the finder is holding the item, and it's the photo the
-- ownership questions are generated from.

alter table reports alter column photo_path drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_found_requires_photo'
  ) then
    alter table reports
      add constraint reports_found_requires_photo
      check (kind = 'lost' or photo_path is not null);
  end if;
end $$;


-- 3. Chat opens when a claim is made -------------------------
-- Previously messages were only allowed once a claim reached 'verified'.
-- Claims now open the conversation immediately, so 'pending' must be
-- allowed too. 'rejected' stays excluded on purpose: a closed claim becomes
-- read-only rather than a channel someone can keep using.

drop policy if exists "claim participants can send messages" on claim_messages;

create policy "claim participants can send messages"
  on claim_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from claims c
      where c.id = claim_messages.claim_id
        and (c.claimant_id = auth.uid() or c.holder_id = auth.uid())
        and c.state in ('pending', 'verified')
    )
  );


-- 4. Handover through a staffed desk -------------------------
-- The finder leaves the item with a guard at one of two desks instead of
-- meeting the owner; the owner then collects it from there. Without this
-- section the drop-off panel on a claim fails to save.

alter table claims
  add column if not exists dropoff_point text
    check (dropoff_point in ('university_ground', 'techpark_desk')),
  add column if not exists dropped_off_at timestamptz,
  add column if not exists collected_at timestamptz;

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

create index if not exists claims_awaiting_collection_idx
  on claims (dropoff_point)
  where dropped_off_at is not null and collected_at is null;

-- Realtime on claims, so the owner is told the item has been handed in
-- without refreshing. RLS on claims is already participant-scoped.
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


-- Done. Expected result: "Success. No rows returned."
