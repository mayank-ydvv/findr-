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


-- Done. Expected result: "Success. No rows returned."
