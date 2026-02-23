-- ============================================================================
-- Migration V019: Add Practice Mode Support
-- Description: Adds is_practice column to games table and updates trigger
--              to exclude practice games from player aggregate stats
-- Date: 2026-02-21
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'V019: Adding practice mode support...';
END $$;

-- ============================================================================
-- STEP 1: Add is_practice column to games table
-- ============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN games.is_practice IS 'Whether this is a practice/solo game (excluded from stats and leaderboards)';

DO $$
BEGIN
  RAISE NOTICE '  ✓ Added is_practice column to games';
END $$;

-- ============================================================================
-- STEP 2: Update trigger function to exclude practice games
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_aggregates_from_game()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if game is being marked as completed AND is not a practice game
  IF NEW.completed_at IS NOT NULL AND (OLD.completed_at IS NULL OR OLD IS NULL) AND NOT COALESCE(NEW.is_practice, false) THEN
    -- Update all players in this game
    UPDATE players p
    SET
      total_games_played = p.total_games_played + 1,
      total_games_won = p.total_games_won + CASE WHEN gp.is_winner THEN 1 ELSE 0 END,
      total_darts_thrown = p.total_darts_thrown + gp.total_darts,
      total_score = p.total_score + gp.total_score,
      total_180s = p.total_180s + gp.count_180s,
      total_140_plus = p.total_140_plus + gp.count_140_plus,
      max_dart_score = GREATEST(p.max_dart_score, gp.max_dart),
      max_turn_score = GREATEST(p.max_turn_score, gp.max_turn),
      total_checkout_attempts = p.total_checkout_attempts + gp.checkout_attempts,
      total_checkout_successes = p.total_checkout_successes + gp.checkout_successes,
      updated_at = NOW()
    FROM game_players gp
    WHERE p.id = gp.player_id AND gp.game_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  RAISE NOTICE '  ✓ Updated trigger function to exclude practice games';
END $$;

-- ============================================================================
-- STEP 3: Recreate trigger on renamed table (games, not games_new)
-- The original trigger was created on games_new in V010, but V013 renamed
-- the table to games. We need to ensure the trigger exists on the current table.
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_update_player_aggregates ON games;
CREATE TRIGGER trigger_update_player_aggregates
AFTER UPDATE OF completed_at ON games
FOR EACH ROW
WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
EXECUTE FUNCTION update_player_aggregates_from_game();

DO $$
BEGIN
  RAISE NOTICE '  ✓ Recreated trigger on games table';
END $$;

-- ============================================================================
-- STEP 4: Record Migration
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES ('V019', 'Add practice mode support (is_practice column + trigger update)')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'V019: Practice mode migration completed successfully';
  RAISE NOTICE '  - is_practice column added to games (default: false)';
  RAISE NOTICE '  - Player aggregate trigger now skips practice games';
  RAISE NOTICE '  - Existing games unaffected (is_practice defaults to false)';
END $$;
