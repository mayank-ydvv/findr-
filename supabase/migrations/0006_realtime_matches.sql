-- Match notifications ride on Postgres Changes rather than the Broadcast
-- channel in lib/realtime.ts. CAMPUS_FEED_CHANNEL is a single public channel
-- every client subscribes to, so it cannot target one user — but a match is
-- only ever the business of the two people whose reports formed it.
--
-- `matches` already has participant-scoped RLS ("participants can view their
-- matches" in 0003_rls.sql), and Realtime applies RLS to Postgres Changes,
-- so adding the table to the publication gets per-user scoping for free.
-- Same reasoning as claim_messages in 0005_realtime.sql.

alter publication supabase_realtime add table matches;
