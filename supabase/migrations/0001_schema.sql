-- Findr schema: zones, reports, secrets, matches, claims, chat.
-- Run in order against a Supabase project with the `vector` extension available.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- zones: seeded campus areas. Every report is pinned to one for aggregation
-- and for the fuzzed "display" location of found items.
-- ---------------------------------------------------------------------------

create table zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m integer not null default 150,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reports: one row per lost or found item.
-- exact_lat/exact_lng hold the true location; display_lat/display_lng are what
-- the public view exposes (identical for 'lost', jittered for 'found').
-- ---------------------------------------------------------------------------

create type report_kind as enum ('lost', 'found');
create type report_status as enum ('open', 'claimed', 'resolved', 'expired');

create table reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind report_kind not null,
  status report_status not null default 'open',

  photo_path text not null,
  user_description text not null default '',

  -- Claude vision extraction
  category text,
  primary_color text,
  secondary_colors text[] not null default '{}',
  brand text,
  distinguishing_marks text[] not null default '{}',
  visible_text text,
  condition_notes text,
  canonical_text text,

  -- geo
  zone_id uuid references zones (id),
  exact_lat double precision not null,
  exact_lng double precision not null,
  display_lat double precision not null,
  display_lng double precision not null,

  -- time
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),

  -- fingerprint
  embedding vector(1024)
);

create index reports_embedding_hnsw on reports
  using hnsw (embedding vector_cosine_ops);

create index reports_kind_status_idx on reports (kind, status);
create index reports_zone_idx on reports (zone_id);
create index reports_occurred_at_idx on reports (occurred_at);

-- ---------------------------------------------------------------------------
-- report_secrets: verification questions + expected answers.
-- Deliberately has NO client-readable RLS policy anywhere in this file.
-- Reachable only via the service-role key from a server route.
-- ---------------------------------------------------------------------------

create table report_secrets (
  report_id uuid primary key references reports (id) on delete cascade,
  verification_questions jsonb not null -- [{ question, expected_answer }]
);

-- ---------------------------------------------------------------------------
-- matches: a suggested/claimed/verified/rejected pairing between one lost and
-- one found report, with the stage-1 base score and the stage-2 AI rerank.
-- ---------------------------------------------------------------------------

create type match_state as enum ('suggested', 'claim_requested', 'verified', 'rejected');

create table matches (
  id uuid primary key default gen_random_uuid(),
  lost_report_id uuid not null references reports (id) on delete cascade,
  found_report_id uuid not null references reports (id) on delete cascade,

  base_score double precision not null,
  ai_confidence integer, -- 0-100, filled in after stage-2 rerank
  ai_reasoning text,
  matching_features text[] not null default '{}',
  conflicting_features text[] not null default '{}',

  state match_state not null default 'suggested',
  created_at timestamptz not null default now(),

  unique (lost_report_id, found_report_id)
);

create index matches_lost_idx on matches (lost_report_id);
create index matches_found_idx on matches (found_report_id);

-- ---------------------------------------------------------------------------
-- claims: a claimant asserting ownership of a found item via a match.
-- ---------------------------------------------------------------------------

create type claim_state as enum ('pending', 'verified', 'rejected');

create table claims (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  claimant_id uuid not null references auth.users (id) on delete cascade,
  holder_id uuid not null references auth.users (id) on delete cascade,

  state claim_state not null default 'pending',
  answers jsonb not null default '[]', -- [{ question, answer }]

  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index claims_match_idx on claims (match_id);
create index claims_claimant_idx on claims (claimant_id);
create index claims_holder_idx on claims (holder_id);

-- ---------------------------------------------------------------------------
-- claim_messages: anonymous chat between claimant and holder.
-- ---------------------------------------------------------------------------

create table claim_messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index claim_messages_claim_idx on claim_messages (claim_id, created_at);
