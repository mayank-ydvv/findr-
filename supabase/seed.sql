-- Seed campus zones — SRM Institute of Science and Technology, Kattankulathur
-- (Potheri, Chennai, ~12.8252°N 80.0476°E). Zone *names* are generic building
-- types spread around the real campus center; nudge center_lat/center_lng
-- per zone if you want them pinned to the actual buildings rather than this
-- illustrative spread. Keep these in sync with CAMPUS_CENTER/CAMPUS_BOUNDS in
-- components/map/CampusMap.tsx — a zone outside those bounds never shows on
-- the map and never location-matches against anything.
--
-- Report rows are NOT seeded here because they need photos in Storage and
-- real embeddings — use `npm run seed` (scripts/seed-reports.ts) after the
-- app is wired up, which calls the same ingest pipeline the app uses.

insert into zones (name, center_lat, center_lng, radius_m) values
  ('Main Library',      12.8255, 80.0474, 120),
  ('Student Union',     12.8246, 80.0461, 100),
  ('Food Court',        12.8250, 80.0488, 90),
  ('Engineering Block', 12.8263, 80.0455, 150),
  ('Tech Park',         12.8270, 80.0467, 140),
  ('Science Building',  12.8238, 80.0481, 130),
  ('Sports Complex',    12.8224, 80.0446, 200),
  ('Main Gate',         12.8219, 80.0496, 80),
  ('Hostel Block A',    12.8279, 80.0506, 160),
  ('Central Lawn',      12.8257, 80.0473, 100)
on conflict do nothing;
