-- Row Level Security. This file is the actual security boundary for the app —
-- treat every policy here as load-bearing, not the client code that happens
-- to also check these things.

-- ---------------------------------------------------------------------------
-- zones: public read-only reference data.
-- ---------------------------------------------------------------------------

alter table zones enable row level security;

create policy "zones are publicly readable"
  on zones for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- reports: owners can manage their own rows directly. Everyone else browses
-- through the public_reports view below, never this table.
-- ---------------------------------------------------------------------------

alter table reports enable row level security;

create policy "owners can select their own reports"
  on reports for select
  to authenticated
  using (user_id = auth.uid());

create policy "authenticated users can insert their own reports"
  on reports for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "owners can update their own reports"
  on reports for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: reports age out via expires_at, they are not deleted by users.

-- ---------------------------------------------------------------------------
-- public_reports: the browsing surface. Deliberately omits exact_lat/exact_lng
-- for found items, and never exposes report_secrets. Owned by the migration
-- role (which bypasses RLS on the base table), so this view shows every open
-- report's safe columns to anon/authenticated regardless of the policies
-- above — that's the intended mechanism, not a bypass to fix later.
-- ---------------------------------------------------------------------------

create view public_reports
  with (security_invoker = false)
  as
  select
    id,
    user_id,
    kind,
    status,
    photo_path,
    user_description,
    category,
    primary_color,
    secondary_colors,
    brand,
    distinguishing_marks,
    visible_text,
    condition_notes,
    zone_id,
    display_lat,
    display_lng,
    -- exact_lat/exact_lng intentionally excluded here.
    occurred_at,
    created_at,
    expires_at
  from reports
  where status in ('open', 'claimed')
    and expires_at > now();

grant select on public_reports to anon, authenticated;

-- ---------------------------------------------------------------------------
-- report_secrets: NO policies granted to anon or authenticated, on purpose.
-- RLS is enabled with zero permissive policies, so every client-side query
-- against this table returns zero rows. It is reachable only through the
-- service-role key from a server route (which bypasses RLS entirely).
-- ---------------------------------------------------------------------------

alter table report_secrets enable row level security;
-- (deliberately no create policy statements here)

-- ---------------------------------------------------------------------------
-- matches: visible to whoever owns either side of the pairing.
-- ---------------------------------------------------------------------------

alter table matches enable row level security;

create policy "participants can view their matches"
  on matches for select
  to authenticated
  using (
    exists (
      select 1 from reports r
      where r.id in (matches.lost_report_id, matches.found_report_id)
        and r.user_id = auth.uid()
    )
  );

-- Matches are written only by server routes using the service-role key.

-- ---------------------------------------------------------------------------
-- claims: visible to the claimant and the holder only.
-- ---------------------------------------------------------------------------

alter table claims enable row level security;

create policy "participants can view their claims"
  on claims for select
  to authenticated
  using (claimant_id = auth.uid() or holder_id = auth.uid());

create policy "claimants can open a claim"
  on claims for insert
  to authenticated
  with check (claimant_id = auth.uid());

-- Verification (state transitions) happens via the service-role key in
-- /api/claims/[id]/verify, so there is no client-side update policy.

-- ---------------------------------------------------------------------------
-- claim_messages: readable and writable only by the claim's two participants.
-- ---------------------------------------------------------------------------

alter table claim_messages enable row level security;

create policy "claim participants can read messages"
  on claim_messages for select
  to authenticated
  using (
    exists (
      select 1 from claims c
      where c.id = claim_messages.claim_id
        and (c.claimant_id = auth.uid() or c.holder_id = auth.uid())
    )
  );

create policy "claim participants can send messages"
  on claim_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from claims c
      where c.id = claim_messages.claim_id
        and (c.claimant_id = auth.uid() or c.holder_id = auth.uid())
        and c.state = 'verified'
    )
  );
