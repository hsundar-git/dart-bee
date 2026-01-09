-- V015: Create League Tables
-- Description: Adds league support with round-robin format
-- Author: Claude
-- Date: 2026-01-09

-- ============================================================================
-- TABLE: leagues (League Metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS leagues (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status: registration, in_progress, completed
  status TEXT NOT NULL DEFAULT 'registration' CHECK (status IN ('registration', 'in_progress', 'completed')),

  -- Game settings (applied to all matches)
  game_type INTEGER NOT NULL DEFAULT 501,
  win_condition TEXT NOT NULL DEFAULT 'exact' CHECK (win_condition IN ('exact', 'below')),
  scoring_mode TEXT NOT NULL DEFAULT 'per-dart' CHECK (scoring_mode IN ('per-dart', 'per-turn')),

  -- League settings
  matches_per_pairing INTEGER NOT NULL DEFAULT 1 CHECK (matches_per_pairing IN (1, 2)),
  -- 1 = single round-robin (everyone plays everyone once)
  -- 2 = double round-robin (everyone plays everyone twice, home/away style)

  -- Points system
  points_for_win INTEGER NOT NULL DEFAULT 3,
  points_for_draw INTEGER NOT NULL DEFAULT 1,
  points_for_loss INTEGER NOT NULL DEFAULT 0,

  -- Device tracking (creator)
  device_id TEXT,

  -- Winner (set when league completes)
  winner_id UUID REFERENCES players(id),

  CONSTRAINT valid_league_game_type CHECK (game_type > 0)
);

COMMENT ON TABLE leagues IS 'League definitions with round-robin format and points system';
COMMENT ON COLUMN leagues.matches_per_pairing IS '1 = single round-robin, 2 = double round-robin';

-- ============================================================================
-- TABLE: league_participants (Players in League with Standings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS league_participants (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Standings statistics
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,

  -- For tiebreakers: leg difference (total legs won - total legs lost)
  legs_won INTEGER NOT NULL DEFAULT 0,
  legs_lost INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_league_player UNIQUE(league_id, player_id),

  -- Generated column for leg difference
  leg_difference INTEGER GENERATED ALWAYS AS (legs_won - legs_lost) STORED
);

COMMENT ON TABLE league_participants IS 'Players in a league with their standings';
COMMENT ON COLUMN league_participants.leg_difference IS 'Legs won minus legs lost (for tiebreakers)';

-- ============================================================================
-- TABLE: league_matches (Fixtures)
-- ============================================================================

CREATE TABLE IF NOT EXISTS league_matches (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to league
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  -- Players (always known in round-robin)
  player1_id UUID NOT NULL REFERENCES players(id),
  player2_id UUID NOT NULL REFERENCES players(id),

  -- Match result
  winner_id UUID REFERENCES players(id), -- NULL = not played or draw
  is_draw BOOLEAN NOT NULL DEFAULT false,

  -- Match status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),

  -- Optional fixture round (for organized scheduling)
  fixture_round INTEGER,

  -- The actual game played
  game_id UUID REFERENCES games(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT different_players CHECK (player1_id != player2_id)
);

COMMENT ON TABLE league_matches IS 'Individual fixtures in a league';
COMMENT ON COLUMN league_matches.fixture_round IS 'Optional grouping for organized fixture scheduling';

-- ============================================================================
-- INDEXES for League Tables
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);
CREATE INDEX IF NOT EXISTS idx_leagues_device_id ON leagues(device_id);
CREATE INDEX IF NOT EXISTS idx_leagues_created_at ON leagues(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_league_participants_league ON league_participants(league_id);
CREATE INDEX IF NOT EXISTS idx_league_participants_player ON league_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_league_participants_points ON league_participants(league_id, points DESC);

CREATE INDEX IF NOT EXISTS idx_league_matches_league ON league_matches(league_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_status ON league_matches(status);
CREATE INDEX IF NOT EXISTS idx_league_matches_players ON league_matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_game ON league_matches(game_id);

-- ============================================================================
-- TRIGGER: Update league.updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_league_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_league_timestamp ON leagues;
CREATE TRIGGER trigger_update_league_timestamp
  BEFORE UPDATE ON leagues
  FOR EACH ROW
  EXECUTE FUNCTION update_league_timestamp();

DROP TRIGGER IF EXISTS trigger_update_league_participant_timestamp ON league_participants;
CREATE TRIGGER trigger_update_league_participant_timestamp
  BEFORE UPDATE ON league_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_league_timestamp();

DROP TRIGGER IF EXISTS trigger_update_league_match_timestamp ON league_matches;
CREATE TRIGGER trigger_update_league_match_timestamp
  BEFORE UPDATE ON league_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_league_timestamp();

-- ============================================================================
-- FUNCTION: Update league standings after match completion
-- ============================================================================

CREATE OR REPLACE FUNCTION update_league_standings()
RETURNS TRIGGER AS $$
DECLARE
  v_league leagues%ROWTYPE;
BEGIN
  -- Only process when match is completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get league for points configuration
    SELECT * INTO v_league FROM leagues WHERE id = NEW.league_id;

    -- Update player 1 statistics
    UPDATE league_participants
    SET
      matches_played = matches_played + 1,
      wins = wins + CASE WHEN NEW.winner_id = NEW.player1_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.is_draw THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.winner_id = NEW.player2_id THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.winner_id = NEW.player1_id THEN v_league.points_for_win
        WHEN NEW.is_draw THEN v_league.points_for_draw
        ELSE v_league.points_for_loss
      END,
      updated_at = NOW()
    WHERE league_id = NEW.league_id AND player_id = NEW.player1_id;

    -- Update player 2 statistics
    UPDATE league_participants
    SET
      matches_played = matches_played + 1,
      wins = wins + CASE WHEN NEW.winner_id = NEW.player2_id THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.is_draw THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.winner_id = NEW.player1_id THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.winner_id = NEW.player2_id THEN v_league.points_for_win
        WHEN NEW.is_draw THEN v_league.points_for_draw
        ELSE v_league.points_for_loss
      END,
      updated_at = NOW()
    WHERE league_id = NEW.league_id AND player_id = NEW.player2_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_league_standings ON league_matches;
CREATE TRIGGER trigger_update_league_standings
  AFTER INSERT OR UPDATE ON league_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_league_standings();

-- ============================================================================
-- Record Migration
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES ('V015', 'Create league tables for round-robin competitions')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'V015: League tables created successfully';
  RAISE NOTICE 'Created tables: leagues, league_participants, league_matches';
  RAISE NOTICE 'Created trigger: update_league_standings (auto-updates standings on match completion)';
END $$;
