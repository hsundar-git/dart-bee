-- V014: Create Tournament Tables
-- Description: Adds tournament support with single and double elimination formats
-- Author: Claude
-- Date: 2026-01-09

-- ============================================================================
-- TABLE: tournaments (Tournament Metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournaments (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status: registration, in_progress, completed
  status TEXT NOT NULL DEFAULT 'registration' CHECK (status IN ('registration', 'in_progress', 'completed')),

  -- Tournament format: single_elimination, double_elimination
  format TEXT NOT NULL DEFAULT 'single_elimination' CHECK (format IN ('single_elimination', 'double_elimination')),

  -- Game settings (applied to all matches)
  game_type INTEGER NOT NULL DEFAULT 501,
  win_condition TEXT NOT NULL DEFAULT 'exact' CHECK (win_condition IN ('exact', 'below')),
  scoring_mode TEXT NOT NULL DEFAULT 'per-dart' CHECK (scoring_mode IN ('per-dart', 'per-turn')),

  -- Tournament size
  max_players INTEGER NOT NULL DEFAULT 8 CHECK (max_players IN (4, 8, 16, 32)),

  -- Device tracking (creator)
  device_id TEXT,

  -- Winner (set when tournament completes)
  winner_id UUID REFERENCES players(id),

  CONSTRAINT valid_tournament_game_type CHECK (game_type > 0)
);

COMMENT ON TABLE tournaments IS 'Tournament definitions with bracket format and game settings';
COMMENT ON COLUMN tournaments.format IS 'single_elimination = lose once and out, double_elimination = lose twice and out';
COMMENT ON COLUMN tournaments.max_players IS 'Tournament bracket size (must be power of 2)';

-- ============================================================================
-- TABLE: tournament_participants (Players in Tournament)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_participants (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Tournament position (random assignment, 1-based)
  bracket_position INTEGER NOT NULL,

  -- Elimination tracking
  eliminated BOOLEAN NOT NULL DEFAULT false,
  eliminated_in_round INTEGER, -- Round where player was eliminated

  -- Final placement (1st, 2nd, 3rd, etc.)
  final_placement INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_tournament_player UNIQUE(tournament_id, player_id),
  CONSTRAINT unique_tournament_bracket_position UNIQUE(tournament_id, bracket_position)
);

COMMENT ON TABLE tournament_participants IS 'Players registered for a tournament';
COMMENT ON COLUMN tournament_participants.bracket_position IS 'Position in bracket (determines initial matchups)';

-- ============================================================================
-- TABLE: tournament_matches (Individual Matches in Bracket)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_matches (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to tournament
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  -- Bracket position
  round INTEGER NOT NULL, -- Positive = winners bracket, negative = losers bracket
  match_number INTEGER NOT NULL, -- Position within round (1-based)

  -- Players (nullable until determined by prior matches)
  player1_id UUID REFERENCES players(id),
  player2_id UUID REFERENCES players(id),

  -- Match result
  winner_id UUID REFERENCES players(id),

  -- Match status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'in_progress', 'completed')),

  -- Navigation (which match does winner/loser advance to)
  winner_next_match_id UUID REFERENCES tournament_matches(id),
  loser_next_match_id UUID REFERENCES tournament_matches(id), -- For double elimination

  -- The actual game played
  game_id UUID REFERENCES games(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_tournament_match_position UNIQUE(tournament_id, round, match_number)
);

COMMENT ON TABLE tournament_matches IS 'Individual matches within a tournament bracket';
COMMENT ON COLUMN tournament_matches.round IS 'Round number (1 = first round, 2 = quarter-finals, etc.). Negative for losers bracket';
COMMENT ON COLUMN tournament_matches.match_number IS 'Match position within round (1-based)';
COMMENT ON COLUMN tournament_matches.winner_next_match_id IS 'Match the winner advances to';
COMMENT ON COLUMN tournament_matches.loser_next_match_id IS 'Match the loser goes to (double elimination only)';

-- ============================================================================
-- INDEXES for Tournament Tables
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_device_id ON tournaments(device_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_player ON tournament_participants(player_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_players ON tournament_matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_game ON tournament_matches(game_id);

-- ============================================================================
-- TRIGGER: Update tournament.updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_tournament_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tournament_timestamp ON tournaments;
CREATE TRIGGER trigger_update_tournament_timestamp
  BEFORE UPDATE ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION update_tournament_timestamp();

DROP TRIGGER IF EXISTS trigger_update_tournament_match_timestamp ON tournament_matches;
CREATE TRIGGER trigger_update_tournament_match_timestamp
  BEFORE UPDATE ON tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_tournament_timestamp();

-- ============================================================================
-- Record Migration
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES ('V014', 'Create tournament tables for bracket-based competitions')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'V014: Tournament tables created successfully';
  RAISE NOTICE 'Created tables: tournaments, tournament_participants, tournament_matches';
  RAISE NOTICE 'Next step: Run V015 to create league tables';
END $$;
