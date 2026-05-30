-- Migration V023: Case-insensitive player names
-- Description: Enforce that player names are unique regardless of case, so
--              "Hem" and "hem" are treated as the same player. Adds a unique
--              functional index on lower(name) for active (non-deleted) players.
-- Date: 2026-05-30
--
-- NOTE: If case-variant duplicates already exist in the players table, this
--       index creation will fail. Resolve duplicates first (see the helper
--       query at the bottom) before running this migration.

-- ============================================================================
-- 1. Detect existing case-insensitive duplicates among active players
--    (informational — run this SELECT manually if the index below fails)
-- ============================================================================
-- SELECT lower(name) AS lname, count(*), array_agg(name) AS variants
-- FROM players
-- WHERE is_deleted IS NULL OR is_deleted = false
-- GROUP BY lower(name)
-- HAVING count(*) > 1;

-- ============================================================================
-- 2. Unique index on lower(name) for active players only
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS players_lower_name_unique_active
    ON players (lower(name))
    WHERE is_deleted IS NULL OR is_deleted = false;
