-- Seed campus zones. Swap these coordinates for your actual campus before
-- the demo — these are placeholder points spaced ~150-400m apart so the
-- heatmap and location-decay scoring have real geometry to work with.
--
-- Report rows are NOT seeded here because they need photos in Storage and
-- real embeddings — use `npm run seed` (scripts/seed-reports.ts) after the
-- app is wired up, which calls the same ingest pipeline the app uses.

insert into zones (name, center_lat, center_lng, radius_m) values
  ('Main Library',      37.42960, -122.16920, 120),
  ('Student Union',     37.42870, -122.17050, 100),
  ('Food Court',        37.42910, -122.16780, 90),
  ('Engineering Block',  37.43040, -122.17110, 150),
  ('Tech Park',         37.43110, -122.16990, 140),
  ('Science Building',  37.42790, -122.16850, 130),
  ('Sports Complex',    37.42650, -122.17200, 200),
  ('Main Gate',         37.42600, -122.16700, 80),
  ('Hostel Block A',    37.43200, -122.16600, 160),
  ('Central Lawn',      37.42980, -122.16930, 100)
on conflict do nothing;
