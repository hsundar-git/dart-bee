-- V018: Add RLS Policies for Tournament and League Tables
-- Description: Enables Row Level Security and creates permissive policies for competition tables
-- Author: Claude
-- Date: 2026-01-19
--
-- ISSUE: V014 (tournaments) and V015 (leagues) were created without RLS policies,
-- causing all operations to fail when Supabase enforces RLS at project level.
-- This migration adds the missing RLS configuration matching the base tables pattern from V013.

-- ============================================================================
-- TOURNAMENT TABLES: Enable RLS
-- ============================================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TOURNAMENT TABLES: Create Permissive Policies
-- ============================================================================

-- Tournaments: Allow all operations (same pattern as games table)
CREATE POLICY "Allow all operations on tournaments"
    ON tournaments
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Tournament Participants: Allow all operations
CREATE POLICY "Allow all operations on tournament_participants"
    ON tournament_participants
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Tournament Matches: Allow all operations
CREATE POLICY "Allow all operations on tournament_matches"
    ON tournament_matches
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- LEAGUE TABLES: Enable RLS
-- ============================================================================

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_matches ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- LEAGUE TABLES: Create Permissive Policies
-- ============================================================================

-- Leagues: Allow all operations
CREATE POLICY "Allow all operations on leagues"
    ON leagues
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- League Participants: Allow all operations
CREATE POLICY "Allow all operations on league_participants"
    ON league_participants
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- League Matches: Allow all operations
CREATE POLICY "Allow all operations on league_matches"
    ON league_matches
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- Record Migration
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES ('V018', 'Add RLS policies for tournament and league tables')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'V018: RLS policies added successfully';
    RAISE NOTICE 'Enabled RLS on: tournaments, tournament_participants, tournament_matches';
    RAISE NOTICE 'Enabled RLS on: leagues, league_participants, league_matches';
    RAISE NOTICE 'Created permissive policies for all 6 tables';
END $$;
