/**
 * Storage Module - Supabase Backend with Normalized Schema
 * Updated for normalized database structure (games, players, game_players, turns)
 */

const Storage = (() => {
    let supabase = null;
    let initialized = false;

    /**
     * Ensure Supabase is initialized
     */
    function ensureInitialized() {
        if (!supabase) {
            if (!SupabaseClient.isConnected()) {
                console.error('Supabase client not connected - attempting to initialize');
                SupabaseClient.init();
            }
            try {
                supabase = SupabaseClient.getClient();
            } catch (error) {
                console.error('Failed to get Supabase client:', error);
                throw error;
            }
        }
        return supabase;
    }

    /**
     * Initialize storage connection
     */
    async function init() {
        try {
            if (initialized) {
                console.log('Storage already initialized');
                return true;
            }

            console.log('Initializing Storage...');
            supabase = ensureInitialized();
            console.log('Supabase client obtained:', !!supabase);

            // Test connection
            const { error } = await supabase
                .from('games')
                .select('id')
                .limit(1);

            if (error) {
                console.error('Database test failed:', error);
                UI.showToast('Failed to connect to database', 'error');
                return false;
            }

            initialized = true;
            console.log('✓ Storage initialized successfully (normalized schema)');
            console.log('✓ Storage.sb available:', !!supabase);
            return true;
        } catch (error) {
            console.error('Storage initialization error:', error);
            return false;
        }
    }

    /**
     * Get all games with player data (ordered by creation date, newest first)
     * NOTE: For large datasets, use getGamesPaginated() instead
     */
    async function getGames(limit = null) {
        try {
            const sb = ensureInitialized();
            let query = sb
                .from('games')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    game_players(
                        id,
                        player_order,
                        starting_score,
                        final_score,
                        is_winner,
                        finish_rank,
                        finish_round,
                        total_turns,
                        total_darts,
                        total_score,
                        max_dart,
                        max_turn,
                        avg_per_turn,
                        player:players(id, name)
                    )
                `)
                .order('created_at', { ascending: false });

            if (limit !== null && limit > 0) {
                query = query.limit(limit);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching games:', error);
                throw error;
            }

            // Transform to match old format for backward compatibility
            return (data || []).map(transformGameFromDB);
        } catch (error) {
            console.error('getGames error:', error);
            return [];
        }
    }

    /**
     * Get games with pagination (recommended for large datasets)
     */
    async function getGamesPaginated(page = 1, perPage = 20, filters = {}) {
        try {
            const sb = ensureInitialized();
            const offset = (page - 1) * perPage;

            let query = sb
                .from('games')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    game_players(
                        id,
                        player_order,
                        starting_score,
                        final_score,
                        is_winner,
                        finish_rank,
                        finish_round,
                        total_turns,
                        total_darts,
                        total_score,
                        avg_per_turn,
                        player:players(id, name)
                    )
                `, { count: 'exact' });

            // Apply sort order
            const sortOrder = filters.sortOrder || 'newest';
            query = query.order('created_at', { ascending: sortOrder === 'oldest' });

            // Apply filters
            if (filters.completed !== undefined) {
                if (filters.completed) {
                    query = query.not('completed_at', 'is', null);
                } else {
                    query = query.is('completed_at', null);
                }
            }

            if (filters.active !== undefined) {
                query = query.eq('is_active', filters.active);
            }

            if (filters.deviceId) {
                query = query.eq('device_id', filters.deviceId);
            }

            // Player name filter - need to query through junction table
            if (filters.playerName) {
                // Get player ID first
                const { data: playerData } = await sb
                    .from('players')
                    .select('id')
                    .ilike('name', `%${filters.playerName}%`)
                    .limit(10);

                if (playerData && playerData.length > 0) {
                    const playerIds = playerData.map(p => p.id);
                    // Filter games that have these players
                    query = query.in('game_players.player_id', playerIds);
                } else {
                    // No matching players, return empty result
                    return {
                        games: [],
                        pagination: { page: 1, perPage, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
                    };
                }
            }

            const { data, count, error } = await query.range(offset, offset + perPage - 1);

            if (error) {
                console.error('Error fetching paginated games:', error);
                throw error;
            }

            return {
                games: (data || []).map(transformGameFromDB),
                pagination: {
                    page,
                    perPage,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / perPage),
                    hasNext: offset + perPage < (count || 0),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            console.error('getGamesPaginated error:', error);
            return {
                games: [],
                pagination: { page: 1, perPage, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
            };
        }
    }

    /**
     * Transform game from new DB format to old format for compatibility
     */
    function transformGameFromDB(dbGame) {
        // Reconstruct players array from game_players
        const players = (dbGame.game_players || [])
            .sort((a, b) => a.player_order - b.player_order)
            .map(gp => ({
                id: gp.id,
                name: gp.player?.name || 'Unknown',
                startingScore: gp.starting_score,
                currentScore: gp.final_score,
                winner: gp.is_winner,
                finish_rank: gp.finish_rank,
                finish_round: gp.finish_round,
                turns: [], // Turns not loaded by default for performance
                stats: {
                    totalDarts: gp.total_darts,
                    totalScore: gp.total_score,
                    avgPerDart: gp.avg_per_turn, // Note: this is actually avg per turn now
                    maxTurn: gp.max_turn,
                    maxDart: gp.max_dart,
                    checkoutAttempts: 0, // Not readily available
                    checkoutSuccess: 0
                }
            }));

        return {
            id: dbGame.id,
            created_at: dbGame.created_at,
            completed_at: dbGame.completed_at,
            game_type: dbGame.game_type,
            win_condition: dbGame.win_condition,
            scoring_mode: dbGame.scoring_mode,
            current_player_index: 0, // Not stored in new schema
            current_turn: dbGame.current_turn,
            is_active: dbGame.is_active,
            device_id: dbGame.device_id,
            players: players
        };
    }

    /**
     * Save a new game with multi-table insert
     */
    async function saveGame(game) {
        try {
            const sb = ensureInitialized();

            // Step 1: Get/create player IDs
            const playerIds = [];
            for (const player of game.players) {
                const playerData = await getOrCreatePlayer(player.name);
                playerIds.push(playerData.id);
            }

            // Step 2: Insert game metadata
            const { data: gameData, error: gameError } = await sb
                .from('games')
                .insert([{
                    id: game.id,
                    created_at: game.created_at,
                    game_type: game.game_type,
                    win_condition: game.win_condition,
                    scoring_mode: game.scoring_mode,
                    is_active: game.is_active,
                    current_turn: game.current_turn,
                    device_id: game.device_id,
                    total_players: game.players.length
                }])
                .select();

            if (gameError) {
                console.error('Error inserting game:', gameError);
                throw gameError;
            }

            // Step 3: Insert game_players
            const gamePlayersData = game.players.map((p, i) => ({
                game_id: game.id,
                player_id: playerIds[i],
                player_order: i,
                starting_score: p.startingScore,
                final_score: p.currentScore,
                is_winner: p.winner || false,
                finish_rank: p.finish_rank,
                finish_round: p.finish_round,
                total_turns: p.turns.length,
                total_darts: p.stats.totalDarts,
                total_score: p.stats.totalScore,
                max_dart: p.stats.maxDart,
                max_turn: p.stats.maxTurn,
                count_180s: countScoresInTurns(p.turns, 180),
                count_140_plus: countScoresInRange(p.turns, 140, 179),
                checkout_attempts: p.stats.checkoutAttempts || 0,
                checkout_successes: p.stats.checkoutSuccess || 0
            }));

            const { data: gpData, error: gpError } = await sb
                .from('game_players')
                .insert(gamePlayersData)
                .select();

            if (gpError) {
                console.error('Error inserting game_players:', gpError);
                throw gpError;
            }

            // Step 4: Insert turns (if any)
            const turnsData = [];
            game.players.forEach((p, pIdx) => {
                const gamePlayerId = gpData[pIdx].id;
                p.turns.forEach((turn, tIdx) => {
                    turnsData.push({
                        game_player_id: gamePlayerId,
                        turn_number: tIdx + 1,
                        round_number: Math.floor(tIdx / game.players.length),
                        dart_scores: turn.darts,
                        score_before: tIdx === 0 ? p.startingScore : (p.turns[tIdx - 1]?.remaining || p.startingScore),
                        score_after: turn.remaining,
                        turn_total: turn.darts.reduce((a, b) => a + b, 0),
                        is_busted: turn.busted || false,
                        is_checkout_attempt: turn.remaining === 0 || turn.remaining < 0,
                        is_successful_checkout: turn.remaining === 0 && !turn.busted,
                        created_at: turn.timestamp ? new Date(turn.timestamp).toISOString() : new Date().toISOString()
                    });
                });
            });

            if (turnsData.length > 0) {
                const { error: turnsError } = await sb
                    .from('turns')
                    .insert(turnsData);

                if (turnsError) {
                    console.error('Error inserting turns:', turnsError);
                    // Don't throw - game is saved, just turns failed
                }
            }

            console.log(`✓ Game saved: ${game.players.length} players, ${turnsData.length} turns`);
            return gameData ? gameData[0] : game;
        } catch (error) {
            console.error('saveGame error:', error);
            throw error;
        }
    }

    /**
     * Helper: Count turns with specific total score
     */
    function countScoresInTurns(turns, targetScore) {
        return turns.filter(turn =>
            turn.darts.reduce((a, b) => a + b, 0) === targetScore
        ).length;
    }

    /**
     * Helper: Count turns with scores in range
     */
    function countScoresInRange(turns, min, max) {
        return turns.filter(turn => {
            const total = turn.darts.reduce((a, b) => a + b, 0);
            return total >= min && total <= max;
        }).length;
    }

    /**
     * Update an existing game
     */
    async function updateGame(gameId, updates) {
        try {
            const sb = ensureInitialized();

            // For now, only update game metadata
            // Full game state updates (players, turns) not supported in normalized schema
            const gameUpdates = {
                completed_at: updates.completed_at,
                is_active: updates.is_active,
                current_turn: updates.current_turn,
                updated_at: new Date().toISOString()
            };

            // Set winner_id if completed
            // Winner is the player with finish_rank = 1 (first to finish)
            // NOT just any player with winner: true (multiple can reach 0 in darts)
            if (updates.completed_at && updates.players) {
                // DEBUG: Log winner detection
                console.log('=== updateGame Winner Detection DEBUG ===');
                console.log('Game ID:', gameId);
                console.log('completed_at:', updates.completed_at);
                console.log('Players:');
                updates.players.forEach((p, i) => {
                    console.log(`  [${i}] ${p.name}: score=${p.currentScore}, winner=${p.winner}, finish_rank=${p.finish_rank}`);
                });

                // First try to find player with finish_rank = 1
                let winner = updates.players.find(p => p.finish_rank === 1);
                console.log('Winner by finish_rank=1:', winner ? winner.name : 'NONE FOUND');

                // Fallback: if no finish_rank, find first player with winner: true
                if (!winner) {
                    winner = updates.players.find(p => p.winner);
                    console.log('Winner by winner=true fallback:', winner ? winner.name : 'NONE FOUND');
                }

                // Last fallback: player with lowest score
                if (!winner) {
                    const sorted = [...updates.players].sort((a, b) =>
                        (a.currentScore || a.score || 0) - (b.currentScore || b.score || 0)
                    );
                    winner = sorted[0];
                    console.log('Winner by lowest score fallback:', winner ? winner.name : 'NONE FOUND');
                    console.log('Sorted by score:', sorted.map(p => `${p.name}:${p.currentScore}`).join(', '));
                }

                console.log('FINAL winner selected:', winner ? winner.name : 'NONE');

                if (winner) {
                    const { data: playerData } = await sb
                        .from('players')
                        .select('id')
                        .eq('name', winner.name)
                        .single();

                    if (playerData) {
                        gameUpdates.winner_id = playerData.id;
                        console.log('Set winner_id to:', playerData.id, 'for player:', winner.name);
                    }
                }
            }

            // IMPORTANT: Update game_players BEFORE setting completed_at
            // The trigger on games.completed_at reads from game_players to update player aggregates
            // If we update completed_at first, the trigger reads stale/zero values
            if (updates.players) {
                await updateGamePlayers(gameId, updates.players);
            }

            const { data, error } = await sb
                .from('games')
                .update(gameUpdates)
                .eq('id', gameId)
                .select();

            if (error) {
                console.error('Error updating game:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateGame error:', error);
            throw error;
        }
    }

    /**
     * Update game_players and turns for an active game
     */
    async function updateGamePlayers(gameId, players) {
        try {
            const sb = ensureInitialized();

            // Get existing game_players
            const { data: existingGP } = await sb
                .from('game_players')
                .select('id, player:players(name)')
                .eq('game_id', gameId);

            if (!existingGP) return;

            // DEBUG: Log all players before update
            console.log('=== updateGamePlayers DEBUG ===');
            console.log('Game ID:', gameId);
            console.log('Players to update:');
            players.forEach((p, i) => {
                console.log(`  [${i}] ${p.name}: score=${p.currentScore}, winner=${p.winner}, finish_rank=${p.finish_rank}, finish_round=${p.finish_round}`);
            });

            // Update each player's stats
            for (const player of players) {
                const gp = existingGP.find(g => g.player.name === player.name);
                if (!gp) continue;

                // Update game_players stats
                // is_winner should be true only for the actual winner (finish_rank = 1)
                // NOT for everyone who reached 0 (player.winner)
                const isActualWinner = player.finish_rank === 1;

                console.log(`  Updating ${player.name}: finish_rank=${player.finish_rank}, isActualWinner=${isActualWinner}`);

                await sb
                    .from('game_players')
                    .update({
                        final_score: player.currentScore,
                        is_winner: isActualWinner,
                        finish_rank: player.finish_rank,
                        finish_round: player.finish_round,
                        total_turns: player.turns.length,
                        total_darts: player.stats.totalDarts,
                        total_score: player.stats.totalScore,
                        max_dart: player.stats.maxDart,
                        max_turn: player.stats.maxTurn,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', gp.id);

                // Insert new turns (check for turns not yet in DB)
                const { data: existingTurns } = await sb
                    .from('turns')
                    .select('turn_number')
                    .eq('game_player_id', gp.id);

                const existingTurnNumbers = new Set((existingTurns || []).map(t => t.turn_number));

                const newTurns = player.turns
                    .map((turn, idx) => ({ turn, number: idx + 1 }))
                    .filter(({ number }) => !existingTurnNumbers.has(number))
                    .map(({ turn, number }) => ({
                        game_player_id: gp.id,
                        turn_number: number,
                        round_number: Math.floor((number - 1) / players.length),
                        dart_scores: turn.darts,
                        score_before: number === 1 ? player.startingScore : (player.turns[number - 2]?.remaining || player.startingScore),
                        score_after: turn.remaining,
                        turn_total: turn.darts.reduce((a, b) => a + b, 0),
                        is_busted: turn.busted || false,
                        is_checkout_attempt: turn.remaining === 0 || turn.remaining < 0,
                        is_successful_checkout: turn.remaining === 0 && !turn.busted,
                        created_at: turn.timestamp ? new Date(turn.timestamp).toISOString() : new Date().toISOString()
                    }));

                if (newTurns.length > 0) {
                    await sb.from('turns').insert(newTurns);
                }
            }
        } catch (error) {
            console.error('updateGamePlayers error:', error);
            // Don't throw - allow game update to succeed even if player update fails
        }
    }

    /**
     * Get a single game by ID
     */
    async function getGame(gameId) {
        try {
            const sb = ensureInitialized();
            const { data, error } = await sb
                .from('games')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    game_players(
                        id,
                        player_order,
                        starting_score,
                        final_score,
                        is_winner,
                        finish_rank,
                        finish_round,
                        total_turns,
                        total_darts,
                        total_score,
                        max_dart,
                        max_turn,
                        avg_per_turn,
                        player:players(id, name),
                        turns(
                            turn_number,
                            dart_scores,
                            score_after,
                            is_busted,
                            created_at
                        )
                    )
                `)
                .eq('id', gameId)
                .single();

            if (error) {
                console.error('Error fetching game:', error);
                throw error;
            }

            // Transform with full turn history
            return transformGameWithTurns(data);
        } catch (error) {
            console.error('getGame error:', error);
            return null;
        }
    }

    /**
     * Transform game with full turn history
     */
    function transformGameWithTurns(dbGame) {
        const players = (dbGame.game_players || [])
            .sort((a, b) => a.player_order - b.player_order)
            .map(gp => {
                const turns = (gp.turns || [])
                    .sort((a, b) => a.turn_number - b.turn_number)
                    .map(t => ({
                        darts: t.dart_scores,
                        remaining: t.score_after,
                        busted: t.is_busted,
                        timestamp: new Date(t.created_at).getTime()
                    }));

                return {
                    id: gp.id,
                    name: gp.player?.name || 'Unknown',
                    startingScore: gp.starting_score,
                    currentScore: gp.final_score,
                    winner: gp.is_winner,
                    finish_rank: gp.finish_rank,
                    finish_round: gp.finish_round,
                    turns: turns,
                    stats: {
                        totalDarts: gp.total_darts,
                        totalScore: gp.total_score,
                        avgPerDart: gp.avg_per_turn,
                        maxTurn: gp.max_turn,
                        maxDart: gp.max_dart,
                        checkoutAttempts: 0,
                        checkoutSuccess: 0
                    }
                };
            });

        return {
            id: dbGame.id,
            created_at: dbGame.created_at,
            completed_at: dbGame.completed_at,
            game_type: dbGame.game_type,
            win_condition: dbGame.win_condition,
            scoring_mode: dbGame.scoring_mode,
            current_player_index: 0,
            current_turn: dbGame.current_turn,
            is_active: dbGame.is_active,
            device_id: dbGame.device_id,
            players: players
        };
    }

    /**
     * Delete a game (CASCADE will delete game_players and turns)
     */
    async function deleteGame(gameId) {
        try {
            const sb = ensureInitialized();
            const { error } = await sb
                .from('games')
                .delete()
                .eq('id', gameId);

            if (error) {
                console.error('Error deleting game:', error);
                throw error;
            }

            console.log('✓ Game deleted (cascaded to game_players and turns)');
            return true;
        } catch (error) {
            console.error('deleteGame error:', error);
            UI.showToast('Failed to delete game', 'error');
            return false;
        }
    }

    /**
     * Get all players
     */
    async function getPlayers() {
        try {
            const sb = ensureInitialized();
            const { data, error } = await sb
                .from('players')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching players:', error);
                throw error;
            }

            // Convert array to object with name as key (for compatibility)
            const playersObj = {};
            (data || []).forEach(player => {
                playersObj[player.name] = player;
            });

            return playersObj;
        } catch (error) {
            console.error('getPlayers error:', error);
            return {};
        }
    }

    /**
     * Get or create a player profile
     */
    async function getOrCreatePlayer(playerName) {
        try {
            const sb = ensureInitialized();

            // Try to fetch existing player
            const { data: existing, error: fetchError } = await sb
                .from('players')
                .select('*')
                .eq('name', playerName)
                .single();

            if (!fetchError && existing) {
                return existing;
            }

            // Create new player if doesn't exist
            const newPlayer = {
                id: generateUUID(),
                name: playerName,
                created_at: new Date().toISOString()
                // Aggregate stats will be 0 by default (database defaults)
            };

            const { data: created, error: insertError } = await sb
                .from('players')
                .insert([newPlayer])
                .select();

            if (insertError) {
                console.error('Error creating player:', insertError);
                throw insertError;
            }

            return created ? created[0] : newPlayer;
        } catch (error) {
            console.error('getOrCreatePlayer error:', error);
            return { id: generateUUID(), name: playerName };
        }
    }

    /**
     * Get all games for a specific player (optimized with junction table)
     */
    async function getPlayerGames(playerName, limit = 50) {
        try {
            const sb = ensureInitialized();

            // First, get player ID
            const { data: playerData } = await sb
                .from('players')
                .select('id')
                .eq('name', playerName)
                .single();

            if (!playerData) {
                return [];
            }

            // Query via game_players junction table
            const { data, error } = await sb
                .from('game_players')
                .select(`
                    game:games(
                        *,
                        winner:players!winner_id(id, name),
                        game_players(
                            id,
                            player_order,
                            starting_score,
                            final_score,
                            is_winner,
                            finish_rank,
                            total_turns,
                            total_darts,
                            total_score,
                            avg_per_turn,
                            player:players(id, name)
                        )
                    )
                `)
                .eq('player_id', playerData.id)
                .order('created_at', { ascending: false, foreignTable: 'games' })
                .limit(limit);

            if (error) {
                console.error('Error fetching player games:', error);
                throw error;
            }

            return (data || [])
                .filter(gp => gp.game) // Filter out nulls
                .map(gp => transformGameFromDB(gp.game));
        } catch (error) {
            console.error('getPlayerGames error:', error);
            return [];
        }
    }

    /**
     * Export all data as JSON
     */
    async function exportData() {
        try {
            const games = await getGames();
            const players = await getPlayers();

            return {
                version: '2.0.0', // Updated version for normalized schema
                exportDate: new Date().toISOString(),
                games: games,
                players: players
            };
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    /**
     * Generate UUID v4
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ============================================================================
    // TOURNAMENT STORAGE OPERATIONS
    // ============================================================================

    /**
     * Save a new tournament
     */
    async function saveTournament(tournament) {
        try {
            const sb = ensureInitialized();

            // Insert tournament
            const { data: tournamentData, error: tournamentError } = await sb
                .from('tournaments')
                .insert([{
                    id: tournament.id,
                    name: tournament.name,
                    created_at: tournament.created_at,
                    status: tournament.status,
                    format: tournament.format,
                    game_type: tournament.game_type,
                    win_condition: tournament.win_condition,
                    scoring_mode: tournament.scoring_mode,
                    max_players: tournament.max_players,
                    device_id: tournament.device_id
                }])
                .select();

            if (tournamentError) {
                console.error('Error inserting tournament:', tournamentError);
                throw tournamentError;
            }

            console.log('✓ Tournament saved:', tournament.name);
            return tournamentData ? tournamentData[0] : tournament;
        } catch (error) {
            console.error('saveTournament error:', error);
            throw error;
        }
    }

    /**
     * Get all tournaments
     */
    async function getTournaments(filters = {}) {
        try {
            const sb = ensureInitialized();
            let query = sb
                .from('tournaments')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    tournament_participants(
                        id,
                        bracket_position,
                        eliminated,
                        final_placement,
                        player:players(id, name)
                    ),
                    tournament_matches(
                        id,
                        round,
                        match_number,
                        status,
                        player1:players!player1_id(id, name),
                        player2:players!player2_id(id, name),
                        match_winner:players!winner_id(id, name)
                    )
                `)
                .order('created_at', { ascending: false });

            if (filters.status) {
                query = query.eq('status', filters.status);
            }

            if (filters.deviceId) {
                query = query.eq('device_id', filters.deviceId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching tournaments:', error);
                throw error;
            }

            return (data || []).map(transformTournamentFromDB);
        } catch (error) {
            console.error('getTournaments error:', error);
            return [];
        }
    }

    /**
     * Get a single tournament by ID
     */
    async function getTournament(tournamentId) {
        try {
            const sb = ensureInitialized();
            const { data, error } = await sb
                .from('tournaments')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    tournament_participants(
                        id,
                        bracket_position,
                        eliminated,
                        eliminated_in_round,
                        final_placement,
                        player:players(id, name)
                    ),
                    tournament_matches(
                        id,
                        round,
                        match_number,
                        status,
                        game_id,
                        winner_next_match_id,
                        loser_next_match_id,
                        player1:players!player1_id(id, name),
                        player2:players!player2_id(id, name),
                        match_winner:players!winner_id(id, name)
                    )
                `)
                .eq('id', tournamentId)
                .single();

            if (error) {
                console.error('Error fetching tournament:', error);
                throw error;
            }

            return transformTournamentFromDB(data);
        } catch (error) {
            console.error('getTournament error:', error);
            return null;
        }
    }

    /**
     * Transform tournament from DB format
     */
    function transformTournamentFromDB(dbTournament) {
        if (!dbTournament) return null;

        return {
            id: dbTournament.id,
            name: dbTournament.name,
            created_at: dbTournament.created_at,
            updated_at: dbTournament.updated_at,
            status: dbTournament.status,
            format: dbTournament.format,
            game_type: dbTournament.game_type,
            win_condition: dbTournament.win_condition,
            scoring_mode: dbTournament.scoring_mode,
            max_players: dbTournament.max_players,
            device_id: dbTournament.device_id,
            winner_id: dbTournament.winner_id,
            winner_name: dbTournament.winner?.name,
            participants: (dbTournament.tournament_participants || []).map(tp => ({
                id: tp.id,
                player_id: tp.player?.id,
                name: tp.player?.name || 'Unknown',
                bracket_position: tp.bracket_position,
                eliminated: tp.eliminated,
                eliminated_in_round: tp.eliminated_in_round,
                final_placement: tp.final_placement
            })),
            matches: (dbTournament.tournament_matches || []).map(tm => ({
                id: tm.id,
                tournament_id: dbTournament.id,
                round: tm.round,
                match_number: tm.match_number,
                player1_id: tm.player1?.id,
                player1_name: tm.player1?.name,
                player2_id: tm.player2?.id,
                player2_name: tm.player2?.name,
                winner_id: tm.match_winner?.id,
                winner_name: tm.match_winner?.name,
                status: tm.status,
                game_id: tm.game_id,
                winner_next_match_id: tm.winner_next_match_id,
                loser_next_match_id: tm.loser_next_match_id
            }))
        };
    }

    /**
     * Update tournament
     */
    async function updateTournament(tournamentId, updates) {
        try {
            const sb = ensureInitialized();

            const tournamentUpdates = {
                status: updates.status,
                updated_at: new Date().toISOString()
            };

            if (updates.winner_name) {
                const { data: playerData } = await sb
                    .from('players')
                    .select('id')
                    .eq('name', updates.winner_name)
                    .single();

                if (playerData) {
                    tournamentUpdates.winner_id = playerData.id;
                }
            }

            const { data, error } = await sb
                .from('tournaments')
                .update(tournamentUpdates)
                .eq('id', tournamentId)
                .select();

            if (error) {
                console.error('Error updating tournament:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateTournament error:', error);
            throw error;
        }
    }

    /**
     * Save tournament participants
     */
    async function saveTournamentParticipants(tournamentId, participants) {
        try {
            const sb = ensureInitialized();

            // Get or create player IDs
            const participantsData = [];
            for (const p of participants) {
                const player = await getOrCreatePlayer(p.name);
                participantsData.push({
                    tournament_id: tournamentId,
                    player_id: player.id,
                    bracket_position: p.bracket_position,
                    eliminated: p.eliminated || false,
                    eliminated_in_round: p.eliminated_in_round,
                    final_placement: p.final_placement
                });
            }

            const { data, error } = await sb
                .from('tournament_participants')
                .insert(participantsData)
                .select();

            if (error) {
                console.error('Error saving tournament participants:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('saveTournamentParticipants error:', error);
            throw error;
        }
    }

    /**
     * Save tournament matches
     */
    async function saveTournamentMatches(tournamentId, matches) {
        try {
            const sb = ensureInitialized();

            // Get player IDs for all players in matches
            const playerIds = {};
            for (const m of matches) {
                if (m.player1_name && !playerIds[m.player1_name]) {
                    const player = await getOrCreatePlayer(m.player1_name);
                    playerIds[m.player1_name] = player.id;
                }
                if (m.player2_name && !playerIds[m.player2_name]) {
                    const player = await getOrCreatePlayer(m.player2_name);
                    playerIds[m.player2_name] = player.id;
                }
                if (m.winner_name && !playerIds[m.winner_name]) {
                    const player = await getOrCreatePlayer(m.winner_name);
                    playerIds[m.winner_name] = player.id;
                }
            }

            const matchesData = matches.map(m => ({
                id: m.id,
                tournament_id: tournamentId,
                round: m.round,
                match_number: m.match_number,
                player1_id: m.player1_name ? playerIds[m.player1_name] : null,
                player2_id: m.player2_name ? playerIds[m.player2_name] : null,
                winner_id: m.winner_name ? playerIds[m.winner_name] : null,
                status: m.status,
                game_id: m.game_id,
                winner_next_match_id: m.winner_next_match_id,
                loser_next_match_id: m.loser_next_match_id
            }));

            const { data, error } = await sb
                .from('tournament_matches')
                .insert(matchesData)
                .select();

            if (error) {
                console.error('Error saving tournament matches:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('saveTournamentMatches error:', error);
            throw error;
        }
    }

    /**
     * Update tournament match
     */
    async function updateTournamentMatch(matchId, updates) {
        try {
            const sb = ensureInitialized();

            const matchUpdates = {
                status: updates.status,
                game_id: updates.game_id,
                updated_at: new Date().toISOString()
            };

            if (updates.player1_name) {
                const { data: p1 } = await sb
                    .from('players')
                    .select('id')
                    .eq('name', updates.player1_name)
                    .single();
                if (p1) matchUpdates.player1_id = p1.id;
            }

            if (updates.player2_name) {
                const { data: p2 } = await sb
                    .from('players')
                    .select('id')
                    .eq('name', updates.player2_name)
                    .single();
                if (p2) matchUpdates.player2_id = p2.id;
            }

            if (updates.winner_name) {
                const { data: winner } = await sb
                    .from('players')
                    .select('id')
                    .eq('name', updates.winner_name)
                    .single();
                if (winner) matchUpdates.winner_id = winner.id;
            }

            const { data, error } = await sb
                .from('tournament_matches')
                .update(matchUpdates)
                .eq('id', matchId)
                .select();

            if (error) {
                console.error('Error updating tournament match:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateTournamentMatch error:', error);
            throw error;
        }
    }

    /**
     * Update tournament participant
     */
    async function updateTournamentParticipant(participantId, updates) {
        try {
            const sb = ensureInitialized();

            const { data, error } = await sb
                .from('tournament_participants')
                .update({
                    eliminated: updates.eliminated,
                    eliminated_in_round: updates.eliminated_in_round,
                    final_placement: updates.final_placement
                })
                .eq('id', participantId)
                .select();

            if (error) {
                console.error('Error updating tournament participant:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateTournamentParticipant error:', error);
            throw error;
        }
    }

    // ============================================================================
    // LEAGUE STORAGE OPERATIONS
    // ============================================================================

    /**
     * Save a new league
     */
    async function saveLeague(league) {
        try {
            const sb = ensureInitialized();

            const { data: leagueData, error: leagueError } = await sb
                .from('leagues')
                .insert([{
                    id: league.id,
                    name: league.name,
                    created_at: league.created_at,
                    status: league.status,
                    game_type: league.game_type,
                    win_condition: league.win_condition,
                    scoring_mode: league.scoring_mode,
                    matches_per_pairing: league.matches_per_pairing,
                    points_for_win: league.points_for_win,
                    points_for_draw: league.points_for_draw,
                    points_for_loss: league.points_for_loss,
                    device_id: league.device_id
                }])
                .select();

            if (leagueError) {
                console.error('Error inserting league:', leagueError);
                throw leagueError;
            }

            console.log('✓ League saved:', league.name);
            return leagueData ? leagueData[0] : league;
        } catch (error) {
            console.error('saveLeague error:', error);
            throw error;
        }
    }

    /**
     * Get all leagues
     */
    async function getLeagues(filters = {}) {
        try {
            const sb = ensureInitialized();
            let query = sb
                .from('leagues')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    league_participants(
                        id,
                        matches_played,
                        wins,
                        draws,
                        losses,
                        points,
                        legs_won,
                        legs_lost,
                        player:players(id, name)
                    ),
                    league_matches(
                        id,
                        status,
                        fixture_round,
                        is_draw,
                        player1:players!player1_id(id, name),
                        player2:players!player2_id(id, name),
                        match_winner:players!winner_id(id, name)
                    )
                `)
                .order('created_at', { ascending: false });

            if (filters.status) {
                query = query.eq('status', filters.status);
            }

            if (filters.deviceId) {
                query = query.eq('device_id', filters.deviceId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching leagues:', error);
                throw error;
            }

            return (data || []).map(transformLeagueFromDB);
        } catch (error) {
            console.error('getLeagues error:', error);
            return [];
        }
    }

    /**
     * Get a single league by ID
     */
    async function getLeague(leagueId) {
        try {
            const sb = ensureInitialized();
            const { data, error } = await sb
                .from('leagues')
                .select(`
                    *,
                    winner:players!winner_id(id, name),
                    league_participants(
                        id,
                        matches_played,
                        wins,
                        draws,
                        losses,
                        points,
                        legs_won,
                        legs_lost,
                        player:players(id, name)
                    ),
                    league_matches(
                        id,
                        status,
                        fixture_round,
                        is_draw,
                        game_id,
                        player1:players!player1_id(id, name),
                        player2:players!player2_id(id, name),
                        match_winner:players!winner_id(id, name)
                    )
                `)
                .eq('id', leagueId)
                .single();

            if (error) {
                console.error('Error fetching league:', error);
                throw error;
            }

            return transformLeagueFromDB(data);
        } catch (error) {
            console.error('getLeague error:', error);
            return null;
        }
    }

    /**
     * Transform league from DB format
     */
    function transformLeagueFromDB(dbLeague) {
        if (!dbLeague) return null;

        return {
            id: dbLeague.id,
            name: dbLeague.name,
            created_at: dbLeague.created_at,
            updated_at: dbLeague.updated_at,
            status: dbLeague.status,
            game_type: dbLeague.game_type,
            win_condition: dbLeague.win_condition,
            scoring_mode: dbLeague.scoring_mode,
            matches_per_pairing: dbLeague.matches_per_pairing,
            points_for_win: dbLeague.points_for_win,
            points_for_draw: dbLeague.points_for_draw,
            points_for_loss: dbLeague.points_for_loss,
            device_id: dbLeague.device_id,
            winner_id: dbLeague.winner_id,
            winner_name: dbLeague.winner?.name,
            participants: (dbLeague.league_participants || []).map(lp => ({
                id: lp.id,
                player_id: lp.player?.id,
                name: lp.player?.name || 'Unknown',
                matches_played: lp.matches_played,
                wins: lp.wins,
                draws: lp.draws,
                losses: lp.losses,
                points: lp.points,
                legs_won: lp.legs_won,
                legs_lost: lp.legs_lost
            })),
            matches: (dbLeague.league_matches || []).map(lm => ({
                id: lm.id,
                league_id: dbLeague.id,
                player1_id: lm.player1?.id,
                player1_name: lm.player1?.name,
                player2_id: lm.player2?.id,
                player2_name: lm.player2?.name,
                winner_id: lm.match_winner?.id,
                winner_name: lm.match_winner?.name,
                is_draw: lm.is_draw,
                status: lm.status,
                fixture_round: lm.fixture_round,
                game_id: lm.game_id
            }))
        };
    }

    /**
     * Update league
     */
    async function updateLeague(leagueId, updates) {
        try {
            const sb = ensureInitialized();

            const leagueUpdates = {
                status: updates.status,
                updated_at: new Date().toISOString()
            };

            if (updates.winner_name) {
                const { data: playerData } = await sb
                    .from('players')
                    .select('id')
                    .eq('name', updates.winner_name)
                    .single();

                if (playerData) {
                    leagueUpdates.winner_id = playerData.id;
                }
            }

            const { data, error } = await sb
                .from('leagues')
                .update(leagueUpdates)
                .eq('id', leagueId)
                .select();

            if (error) {
                console.error('Error updating league:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateLeague error:', error);
            throw error;
        }
    }

    /**
     * Save league participants
     */
    async function saveLeagueParticipants(leagueId, participants) {
        try {
            const sb = ensureInitialized();

            const participantsData = [];
            for (const p of participants) {
                const player = await getOrCreatePlayer(p.name);
                participantsData.push({
                    league_id: leagueId,
                    player_id: player.id,
                    matches_played: p.matches_played || 0,
                    wins: p.wins || 0,
                    draws: p.draws || 0,
                    losses: p.losses || 0,
                    points: p.points || 0,
                    legs_won: p.legs_won || 0,
                    legs_lost: p.legs_lost || 0
                });
            }

            const { data, error } = await sb
                .from('league_participants')
                .insert(participantsData)
                .select();

            if (error) {
                console.error('Error saving league participants:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('saveLeagueParticipants error:', error);
            throw error;
        }
    }

    /**
     * Save league matches
     */
    async function saveLeagueMatches(leagueId, matches) {
        try {
            const sb = ensureInitialized();

            const playerIds = {};
            for (const m of matches) {
                if (m.player1_name && !playerIds[m.player1_name]) {
                    const player = await getOrCreatePlayer(m.player1_name);
                    playerIds[m.player1_name] = player.id;
                }
                if (m.player2_name && !playerIds[m.player2_name]) {
                    const player = await getOrCreatePlayer(m.player2_name);
                    playerIds[m.player2_name] = player.id;
                }
            }

            const matchesData = matches.map(m => ({
                id: m.id,
                league_id: leagueId,
                player1_id: playerIds[m.player1_name],
                player2_id: playerIds[m.player2_name],
                winner_id: m.winner_name ? playerIds[m.winner_name] : null,
                is_draw: m.is_draw || false,
                status: m.status,
                fixture_round: m.fixture_round,
                game_id: m.game_id
            }));

            const { data, error } = await sb
                .from('league_matches')
                .insert(matchesData)
                .select();

            if (error) {
                console.error('Error saving league matches:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('saveLeagueMatches error:', error);
            throw error;
        }
    }

    /**
     * Update league match
     */
    async function updateLeagueMatch(matchId, updates) {
        try {
            const sb = ensureInitialized();

            const matchUpdates = {
                status: updates.status,
                is_draw: updates.is_draw,
                game_id: updates.game_id,
                updated_at: new Date().toISOString()
            };

            if (updates.winner_name) {
                const { data: winner } = await sb
                    .from('players')
                    .select('id')
                    .eq('name', updates.winner_name)
                    .single();
                if (winner) matchUpdates.winner_id = winner.id;
            } else if (updates.is_draw) {
                matchUpdates.winner_id = null;
            }

            const { data, error } = await sb
                .from('league_matches')
                .update(matchUpdates)
                .eq('id', matchId)
                .select();

            if (error) {
                console.error('Error updating league match:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateLeagueMatch error:', error);
            throw error;
        }
    }

    /**
     * Update league participant standings
     */
    async function updateLeagueParticipant(participantId, updates) {
        try {
            const sb = ensureInitialized();

            const { data, error } = await sb
                .from('league_participants')
                .update({
                    matches_played: updates.matches_played,
                    wins: updates.wins,
                    draws: updates.draws,
                    losses: updates.losses,
                    points: updates.points,
                    legs_won: updates.legs_won,
                    legs_lost: updates.legs_lost
                })
                .eq('id', participantId)
                .select();

            if (error) {
                console.error('Error updating league participant:', error);
                throw error;
            }

            return data ? data[0] : null;
        } catch (error) {
            console.error('updateLeagueParticipant error:', error);
            throw error;
        }
    }

    // Public API
    return {
        init,
        get sb() {
            console.log('Storage.sb getter called, supabase =', !!supabase);
            if (supabase) {
                return supabase;
            }
            try {
                const client = ensureInitialized();
                console.log('ensureInitialized returned:', !!client);
                return client;
            } catch (error) {
                console.error('Storage.sb getter error:', error);
                // Try one more time to initialize
                try {
                    SupabaseClient.init();
                    const client = SupabaseClient.getClient();
                    supabase = client; // Cache it
                    return client;
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                    return null;
                }
            }
        }, // Expose Supabase client
        getGames,
        getGamesPaginated,
        saveGame,
        updateGame,
        getGame,
        deleteGame,
        getPlayers,
        getOrCreatePlayer,
        getPlayerGames,
        exportData,
        generateUUID,
        // Tournament operations
        saveTournament,
        getTournaments,
        getTournament,
        updateTournament,
        saveTournamentParticipants,
        saveTournamentMatches,
        updateTournamentMatch,
        updateTournamentParticipant,
        // League operations
        saveLeague,
        getLeagues,
        getLeague,
        updateLeague,
        saveLeagueParticipants,
        saveLeagueMatches,
        updateLeagueMatch,
        updateLeagueParticipant
    };
})();

// Storage initialization is now handled by app.js to ensure proper sequencing
