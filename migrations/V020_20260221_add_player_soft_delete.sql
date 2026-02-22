-- ============================================================================
-- Migration V020: Add Soft Delete for Players
-- Description: Adds is_deleted column to players table for soft delete support
-- Date: 2026-02-21
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'V020: Adding soft delete support for players...';
END $$;

-- ============================================================================
-- STEP 1: Add is_deleted column to players table
-- ============================================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN players.is_deleted IS 'Soft delete flag - hidden from UI but game history preserved';

DO $$
BEGIN
  RAISE NOTICE '  ✓ Added is_deleted column to players';
END $$;

-- ============================================================================
-- STEP 2: Record Migration
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES ('V020', 'Add soft delete for players (is_deleted column)')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'V020: Soft delete migration completed successfully';
  RAISE NOTICE '  - is_deleted column added to players (default: false)';
  RAISE NOTICE '  - Existing players unaffected (is_deleted defaults to false)';
END $$;
