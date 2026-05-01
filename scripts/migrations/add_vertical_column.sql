-- Recipes Plan v5.4 / A.5 — collapse 16 categories to 6 verticals.
--
-- Adds a `vertical` text column to the skills table, populated by the
-- mapping in scripts/map_skills_to_verticals.py. Tori applies this against
-- prod after the worker PR merges — this file is staged only.
--
-- Verticals (6):
--   marketing | code | web-scraping | ops | sales | sim-robotics
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE patterns.

BEGIN;

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS vertical text;

CREATE INDEX IF NOT EXISTS skills_vertical_idx
  ON skills (vertical)
  WHERE vertical IS NOT NULL;

ALTER TABLE skills
  ADD CONSTRAINT skills_vertical_chk
  CHECK (
    vertical IS NULL
    OR vertical IN ('marketing', 'code', 'web-scraping', 'ops', 'sales', 'sim-robotics')
  );

-- Backfill is performed by scripts/map_skills_to_verticals.py
-- which emits an UPDATE per category. Run that out-of-band, then:
--
--   ALTER TABLE skills ALTER COLUMN vertical SET NOT NULL;
--
-- once every row has a vertical assigned. (Left commented — Tori
-- decides timing.)

COMMIT;
