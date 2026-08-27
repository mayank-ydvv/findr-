-- A person who lost something often has no photo of it — that's precisely
-- the asymmetry voyage-multimodal-3 was chosen for: a typed description and
-- a photo land in the same vector space, so a photoless lost report can
-- still match against a finder's picture.
--
-- Found reports keep the requirement. The finder is holding the item, and
-- report_secrets' proof-of-ownership questions are generated from the FOUND
-- photo specifically (see app/api/claims/[id]/verify/route.ts) — without it
-- there is no verification mechanism at all, only an honour system.

alter table reports alter column photo_path drop not null;

alter table reports
  add constraint reports_found_requires_photo
  check (kind = 'lost' or photo_path is not null);
