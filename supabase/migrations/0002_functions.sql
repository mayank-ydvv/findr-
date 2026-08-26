-- Geo helper, candidate retrieval (stage 1), and zone activity aggregation.

-- ---------------------------------------------------------------------------
-- haversine_m: great-circle distance in metres. Campus-scale distances never
-- need PostGIS accuracy, so a direct formula avoids an extra extension.
-- ---------------------------------------------------------------------------

create or replace function haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe
as $$
  select 6371000 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      sin(radians(lng2 - lng1) / 2) ^ 2
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- find_candidates: stage-1 recall for a given report.
--   1. Hard gates: opposite kind, open status, same category, directional
--      time window (a found report can't predate lost_at - 2h).
--   2. ANN prefilter via the HNSW index (cheap, approximate, over-fetches).
--   3. Full weighted score over the prefiltered set, returned best-first.
-- Caller (the /api/match route) takes the top 5 for the Claude rerank.
-- ---------------------------------------------------------------------------

-- Not security definer: this is only ever called via the service-role key
-- from server code (lib/matching.ts), which bypasses RLS anyway. Grants
-- below are restricted so it's never reachable straight from the browser.
create or replace function find_candidates(
  p_report_id uuid,
  p_match_limit int default 5
) returns table (
  candidate_id uuid,
  base_score double precision,
  vector_similarity double precision,
  distance_m double precision,
  hours_apart double precision
)
language sql stable
as $$
  with target as (
    select * from reports where id = p_report_id
  ),
  prefiltered as (
    select r.*
    from reports r, target t
    where r.id <> t.id
      and r.kind <> t.kind
      and r.status = 'open'
      and r.category = t.category
      and r.embedding is not null
      and t.embedding is not null
      and (
        case
          when t.kind = 'lost'
            then r.occurred_at >= t.occurred_at - interval '2 hours'
          else t.occurred_at >= r.occurred_at - interval '2 hours'
        end
      )
    order by r.embedding <=> t.embedding
    limit greatest(p_match_limit * 4, 20)
  )
  select
    p.id as candidate_id,
    (
      0.60 * (1 - (p.embedding <=> t.embedding)) +
      0.15 * 1.0 -- category already gated equal above
      + 0.15 * exp(-least(haversine_m(t.exact_lat, t.exact_lng, p.exact_lat, p.exact_lng), 100000) / 300.0)
      + 0.10 * exp(-abs(extract(epoch from (p.occurred_at - t.occurred_at)) / 3600.0) / 72.0)
    ) as base_score,
    1 - (p.embedding <=> t.embedding) as vector_similarity,
    haversine_m(t.exact_lat, t.exact_lng, p.exact_lat, p.exact_lng) as distance_m,
    abs(extract(epoch from (p.occurred_at - t.occurred_at)) / 3600.0) as hours_apart
  from prefiltered p, target t
  order by base_score desc
  limit p_match_limit
$$;

-- ---------------------------------------------------------------------------
-- zone_activity: report count in a zone within a lookback window, for the
-- "high-loss area" insight chip shown on the report form.
-- ---------------------------------------------------------------------------

-- security definer: this only ever returns a count, never row contents, so
-- it's safe to run with elevated privilege — but it MUST bypass RLS, or an
-- authenticated caller would only ever count their own reports in the zone
-- instead of everyone's, making the "high-loss area" insight meaningless.
create or replace function zone_activity(
  p_zone_id uuid,
  p_hours int default 24
) returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int
  from reports
  where zone_id = p_zone_id
    and created_at >= now() - (p_hours || ' hours')::interval
$$;

revoke all on function find_candidates(uuid, int) from public, anon, authenticated;
grant execute on function find_candidates(uuid, int) to service_role;

grant execute on function zone_activity(uuid, int) to anon, authenticated;
