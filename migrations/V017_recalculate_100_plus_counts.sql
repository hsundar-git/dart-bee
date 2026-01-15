-- Migration: Recalculate 100+ counts from turn data
-- This updates count_180s to count turns with score >= 100 (previously was exact 180 only)
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  updated_game_players INTEGER;
  updated_players INTEGER;
  total_100_plus_turns INTEGER;
BEGIN
  RAISE NOTICE '=== Recalculating 100+ Turn Counts ===';
  RAISE NOTICE '';

  -- Step 1: Update game_players.count_180s to count turns >= 100
  RAISE NOTICE 'Step 1: Updating game_players.count_180s...';

  WITH turn_counts AS (
    SELECT
      game_player_id,
      COUNT(*) FILTER (WHERE turn_total >= 100) as count_100_plus
    FROM turns
    GROUP BY game_player_id
  )
  UPDATE game_players gp
  SET count_180s = COALESCE(tc.count_100_plus, 0)
  FROM turn_counts tc
  WHERE gp.id = tc.game_player_id
    AND gp.count_180s != COALESCE(tc.count_100_plus, 0);

  GET DIAGNOSTICS updated_game_players = ROW_COUNT;
  RAISE NOTICE '  Updated % game_player records', updated_game_players;

  -- Step 2: Recalculate player totals from game_players
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Updating players.total_180s...';

  WITH player_totals AS (
    SELECT
      gp.player_id,
      SUM(gp.count_180s) as total_100_plus
    FROM game_players gp
    GROUP BY gp.player_id
  )
  UPDATE players p
  SET total_180s = COALESCE(pt.total_100_plus, 0)
  FROM player_totals pt
  WHERE p.id = pt.player_id
    AND p.total_180s != COALESCE(pt.total_100_plus, 0);

  GET DIAGNOSTICS updated_players = ROW_COUNT;
  RAISE NOTICE '  Updated % player records', updated_players;

  -- Step 3: Refresh the materialized view
  RAISE NOTICE '';
  RAISE NOTICE 'Step 3: Refreshing player_leaderboard view...';
  REFRESH MATERIALIZED VIEW CONCURRENTLY player_leaderboard;
  RAISE NOTICE '  Refreshed player_leaderboard';

  -- Summary
  RAISE NOTICE '';
  RAISE NOTICE '=== Migration Complete ===';

  SELECT COUNT(*) INTO total_100_plus_turns FROM turns WHERE turn_total >= 100;
  RAISE NOTICE 'Total 100+ turns in database: %', total_100_plus_turns;

  RAISE NOTICE '';
  RAISE NOTICE 'Note: The database column is still named "count_180s" and "total_180s"';
  RAISE NOTICE 'but now stores counts of turns with score >= 100';
END $$;

-- Verification query (run separately to check results)
-- SELECT
--   p.name,
--   p.total_180s as "100+ Count",
--   (SELECT COUNT(*) FROM turns t
--    JOIN game_players gp ON t.game_player_id = gp.id
--    WHERE gp.player_id = p.id AND t.turn_total >= 100) as "Calculated 100+"
-- FROM players p
-- WHERE p.total_180s > 0 OR EXISTS (
--   SELECT 1 FROM turns t
--   JOIN game_players gp ON t.game_player_id = gp.id
--   WHERE gp.player_id = p.id AND t.turn_total >= 100
-- )
-- ORDER BY p.total_180s DESC;
