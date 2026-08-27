-- Chat opens when a claim is made, not only once it's verified, so the two
-- people can actually coordinate a handoff.
--
-- The security tradeoff this creates is real and is handled in the UI rather
-- than here: a false claimant can now message the finder before proving
-- anything, and could simply ask "what sticker is on it?" to obtain a
-- verification answer. AnonChat therefore shows the finder a standing
-- warning not to describe marks, stickers, or contents until the claimant
-- has passed. The database still refuses messages on a settled claim.

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
        -- 'rejected' is excluded on purpose: once a claim fails or is
        -- dismissed, the thread becomes read-only rather than a channel a
        -- rejected claimant can keep using to pressure the finder.
        and c.state in ('pending', 'verified')
    )
  );
