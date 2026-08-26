-- Postgres Changes (not Broadcast) is the right tool for claim_messages: every
-- column on this table is meant for exactly the claim's two participants, so
-- there's no privacy-projection concern the way there is for `reports` (see
-- lib/realtime.ts for why the campus feed uses Broadcast instead).

alter publication supabase_realtime add table claim_messages;
