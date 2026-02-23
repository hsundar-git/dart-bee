-- V021: Fix stale aggregate stats in game_players and players tables
-- Description: Recalculates count_180s, count_140_plus, max_turn, and max_turn_score
--              from actual turns data. These were stale after V017 changed threshold from 180 to 100.
-- Date: 2026-02-22

-- Step 1: Fix game_players counts and max_turn from actual turns
UPDATE game_players gp SET
  count_180s = COALESCE(sub.cnt_100, 0),
  count_140_plus = COALESCE(sub.cnt_140, 0),
  max_turn = GREATEST(COALESCE(gp.max_turn, 0), COALESCE(sub.actual_max_turn, 0))
FROM (
  SELECT t.game_player_id,
         COUNT(*) FILTER (WHERE t.turn_total >= 100) as cnt_100,
         COUNT(*) FILTER (WHERE t.turn_total >= 140) as cnt_140,
         MAX(t.turn_total) as actual_max_turn
  FROM turns t
  GROUP BY t.game_player_id
) sub
WHERE sub.game_player_id = gp.id;

-- Step 2: Fix player aggregate totals from actual turns
UPDATE players p SET
  total_180s = COALESCE(sub.cnt_100, 0),
  total_140_plus = COALESCE(sub.cnt_140, 0),
  max_turn_score = GREATEST(COALESCE(p.max_turn_score, 0), COALESCE(sub.actual_max_turn, 0))
FROM (
  SELECT gp.player_id,
         COUNT(*) FILTER (WHERE t.turn_total >= 100) as cnt_100,
         COUNT(*) FILTER (WHERE t.turn_total >= 140) as cnt_140,
         MAX(t.turn_total) as actual_max_turn
  FROM game_players gp
  JOIN games g ON g.id = gp.game_id AND g.completed_at IS NOT NULL AND (g.is_practice IS NULL OR g.is_practice = false)
  JOIN turns t ON t.game_player_id = gp.id
  GROUP BY gp.player_id
) sub
WHERE sub.player_id = p.id;

-- Step 3: Refresh materialized view
REFRESH MATERIALIZED VIEW player_leaderboard;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'V021: Aggregate stats fixed';
  RAISE NOTICE '  - Recalculated game_players: count_180s, count_140_plus, max_turn';
  RAISE NOTICE '  - Recalculated players: total_180s, total_140_plus, max_turn_score';
  RAISE NOTICE '  - Refreshed player_leaderboard materialized view';
  RAISE NOTICE '========================================';
END $$;
