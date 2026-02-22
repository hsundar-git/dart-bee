/**
 * LocalStorage Module - Full mirror of Storage's public API
 * Operates on LocalDB (localStorage-backed JSON arrays).
 * Replaces Supabase queries for offline / local mode.
 */

const LocalStorageBackend = (() => {

    // ---------- helpers ----------

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function countScoresInRange(turns, min, max) {
        return turns.filter(t => {
            const total = t.darts.reduce((a, b) => a + b, 0);
            return total >= min && total <= max;
        }).length;
    }

    // ---------- init ----------

    function init() {
        console.log('LocalStorageBackend initialized (offline mode)');
        // Log data summary for debugging
        const games = LocalDB.getTable('games');
        const players = LocalDB.getTable('players');
        const gp = LocalDB.getTable('game_players');
        console.log(`  📊 Data: ${games.length} games, ${players.length} players, ${gp.length} game_players`);
        // Recompute player aggregates on init to ensure stats are up to date
        if (players.length > 0 && gp.length > 0) {
            recomputeAllPlayerAggregates();
        }
        return true;
    }

    // ---------- Player helpers ----------

    function getOrCreatePlayer(playerName) {
        const players = LocalDB.getTable('players');
        let player = players.find(p => p.name === playerName);
        if (player) return player;

        player = {
            id: generateUUID(),
            name: playerName,
            created_at: new Date().toISOString(),
            total_games_played: 0,
            total_games_won: 0,
            win_rate: 0,
            total_darts_thrown: 0,
            total_score: 0,
            avg_per_dart: 0,
            avg_per_turn: 0,
            max_dart_score: 0,
            max_turn_score: 0,
            total_100s: 0,
            total_140_plus: 0,
            best_checkout: 0,
            checkout_percentage: 0
        };
        LocalDB.insertRows('players', [player]);
        return player;
    }

    // ---------- Games ----------

    function transformGameFromDB(dbGame) {
        const gamePlayers = LocalDB.getTable('game_players')
            .filter(gp => gp.game_id === dbGame.id)
            .sort((a, b) => a.player_order - b.player_order);

        const allPlayers = LocalDB.getTable('players');

        const players = gamePlayers.map(gp => {
            const playerRecord = allPlayers.find(p => p.id === gp.player_id);
            return {
                id: gp.id,
                name: playerRecord?.name || 'Unknown',
                startingScore: gp.starting_score,
                currentScore: gp.final_score,
                winner: gp.is_winner,
                finish_rank: gp.finish_rank,
                finish_round: gp.finish_round,
                turns: [],
                totalTurns: gp.total_turns || 0,
                stats: {
                    totalDarts: gp.total_darts,
                    totalScore: gp.total_score,
                    totalTurns: gp.total_turns || 0,
                    avgPerDart: gp.avg_per_turn,
                    maxTurn: gp.max_turn,
                    maxDart: gp.max_dart,
                    checkoutAttempts: 0,
                    checkoutSuccess: 0
                }
            };
        });

        // Calculate current player index
        const activePlayers = gamePlayers
            .map((gp, index) => ({
                index,
                turnCount: gp.total_turns || 0,
                isFinished: gp.is_winner || gp.finish_rank != null
            }))
            .filter(p => !p.isFinished);

        let currentPlayerIndex = 0;
        if (activePlayers.length > 0) {
            const minTurns = Math.min(...activePlayers.map(p => p.turnCount));
            const next = activePlayers.find(p => p.turnCount === minTurns);
            currentPlayerIndex = next ? next.index : 0;
        }

        return {
            id: dbGame.id,
            created_at: dbGame.created_at,
            completed_at: dbGame.completed_at,
            game_type: dbGame.game_type,
            win_condition: dbGame.win_condition,
            scoring_mode: dbGame.scoring_mode,
            current_player_index: currentPlayerIndex,
            current_turn: dbGame.current_turn,
            is_active: dbGame.is_active,
            is_practice: dbGame.is_practice || false,
            device_id: dbGame.device_id,
            players: players
        };
    }

    function transformGameWithTurns(dbGame) {
        const gamePlayers = LocalDB.getTable('game_players')
            .filter(gp => gp.game_id === dbGame.id)
            .sort((a, b) => a.player_order - b.player_order);

        const allPlayers = LocalDB.getTable('players');
        const allTurns = LocalDB.getTable('turns');

        const players = gamePlayers.map(gp => {
            const playerRecord = allPlayers.find(p => p.id === gp.player_id);
            const turns = allTurns
                .filter(t => t.game_player_id === gp.id)
                .sort((a, b) => a.turn_number - b.turn_number)
                .map(t => ({
                    darts: t.dart_scores,
                    remaining: t.score_after,
                    busted: t.is_busted,
                    timestamp: new Date(t.created_at).getTime()
                }));

            return {
                id: gp.id,
                name: playerRecord?.name || 'Unknown',
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

        const activePlayers = gamePlayers
            .map((gp, index) => ({
                index,
                turnCount: gp.total_turns || 0,
                isFinished: gp.is_winner || gp.finish_rank != null
            }))
            .filter(p => !p.isFinished);

        let currentPlayerIndex = 0;
        if (activePlayers.length > 0) {
            const minTurns = Math.min(...activePlayers.map(p => p.turnCount));
            const next = activePlayers.find(p => p.turnCount === minTurns);
            currentPlayerIndex = next ? next.index : 0;
        }

        return {
            id: dbGame.id,
            created_at: dbGame.created_at,
            completed_at: dbGame.completed_at,
            game_type: dbGame.game_type,
            win_condition: dbGame.win_condition,
            scoring_mode: dbGame.scoring_mode,
            current_player_index: currentPlayerIndex,
            current_turn: dbGame.current_turn,
            is_active: dbGame.is_active,
            is_practice: dbGame.is_practice || false,
            device_id: dbGame.device_id,
            players: players
        };
    }

    async function getGames(limit = null, filters = {}) {
        let games = LocalDB.getTable('games');

        // Filter out practice games by default
        if (filters.includePractice !== true) {
            games = games.filter(g => !g.is_practice);
        }

        games.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (limit !== null && limit > 0) {
            games = games.slice(0, limit);
        }

        return games.map(transformGameFromDB);
    }

    async function getGamesPaginated(page = 1, perPage = 20, filters = {}) {
        let games = LocalDB.getTable('games');

        // Filter out practice games by default
        if (filters.includePractice !== true) {
            games = games.filter(g => !g.is_practice);
        }

        // Apply other filters
        if (filters.completed !== undefined) {
            games = games.filter(g => filters.completed ? g.completed_at != null : g.completed_at == null);
        }
        if (filters.active !== undefined) {
            games = games.filter(g => g.is_active === filters.active);
        }
        if (filters.deviceId) {
            games = games.filter(g => g.device_id === filters.deviceId);
        }

        // Player name filter
        if (filters.playerName) {
            const allPlayers = LocalDB.getTable('players');
            const matchingIds = allPlayers
                .filter(p => p.name.toLowerCase().includes(filters.playerName.toLowerCase()))
                .map(p => p.id);
            const allGP = LocalDB.getTable('game_players');
            const gameIdsWithPlayer = new Set(
                allGP.filter(gp => matchingIds.includes(gp.player_id)).map(gp => gp.game_id)
            );
            games = games.filter(g => gameIdsWithPlayer.has(g.id));
        }

        // Sort
        const sortOrder = filters.sortOrder || 'newest';
        games.sort((a, b) => {
            const diff = new Date(b.created_at) - new Date(a.created_at);
            return sortOrder === 'oldest' ? -diff : diff;
        });

        const total = games.length;
        const offset = (page - 1) * perPage;
        const pageGames = games.slice(offset, offset + perPage);

        return {
            games: pageGames.map(transformGameFromDB),
            pagination: {
                page,
                perPage,
                total,
                totalPages: Math.ceil(total / perPage),
                hasNext: offset + perPage < total,
                hasPrev: page > 1
            }
        };
    }

    async function getGame(gameId) {
        const games = LocalDB.getTable('games');
        const dbGame = games.find(g => g.id === gameId);
        if (!dbGame) return null;
        return transformGameWithTurns(dbGame);
    }

    async function saveGame(game) {
        // Step 1: Get/create player IDs
        const playerIds = game.players.map(p => getOrCreatePlayer(p.name).id);

        // Step 2: Insert game metadata
        const gameRow = {
            id: game.id,
            created_at: game.created_at,
            completed_at: game.completed_at || null,
            game_type: game.game_type,
            win_condition: game.win_condition,
            scoring_mode: game.scoring_mode,
            is_active: game.is_active,
            is_practice: game.is_practice || false,
            current_turn: game.current_turn,
            device_id: game.device_id,
            total_players: game.players.length,
            winner_id: null,
            updated_at: new Date().toISOString()
        };
        LocalDB.insertRows('games', [gameRow]);

        // Step 3: Insert game_players
        const gpRows = game.players.map((p, i) => ({
            id: generateUUID(),
            game_id: game.id,
            player_id: playerIds[i],
            player_order: i,
            starting_score: p.startingScore,
            final_score: p.currentScore,
            is_winner: p.winner || false,
            finish_rank: p.finish_rank || null,
            finish_round: p.finish_round || null,
            total_turns: p.turns.length,
            total_darts: p.stats.totalDarts,
            total_score: p.stats.totalScore,
            max_dart: p.stats.maxDart,
            max_turn: p.stats.maxTurn,
            avg_per_turn: p.stats.avgPerDart || 0,
            count_180s: countScoresInRange(p.turns, 100, Infinity),
            count_140_plus: countScoresInRange(p.turns, 140, Infinity),
            checkout_attempts: p.stats.checkoutAttempts || 0,
            checkout_successes: p.stats.checkoutSuccess || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        LocalDB.insertRows('game_players', gpRows);

        // Step 4: Insert turns
        const turnRows = [];
        game.players.forEach((p, pIdx) => {
            const gpId = gpRows[pIdx].id;
            p.turns.forEach((turn, tIdx) => {
                turnRows.push({
                    id: generateUUID(),
                    game_player_id: gpId,
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
        if (turnRows.length > 0) {
            LocalDB.insertRows('turns', turnRows);
        }

        console.log(`[local] Game saved: ${game.players.length} players, ${turnRows.length} turns`);
        return gameRow;
    }

    async function updateGame(gameId, updates) {
        // Update game_players first (like Supabase version)
        if (updates.players) {
            await updateGamePlayers(gameId, updates.players);
        }

        // Determine winner
        let winnerId = null;
        if (updates.completed_at && updates.players) {
            let winner = updates.players.find(p => p.finish_rank === 1);
            if (!winner) winner = updates.players.find(p => p.winner);
            if (!winner) {
                const sorted = [...updates.players].sort((a, b) =>
                    (a.currentScore || 0) - (b.currentScore || 0)
                );
                winner = sorted[0];
            }
            if (winner) {
                const players = LocalDB.getTable('players');
                const pRecord = players.find(p => p.name === winner.name);
                if (pRecord) winnerId = pRecord.id;
            }
        }

        const updated = LocalDB.updateRows('games', r => r.id === gameId, row => ({
            ...row,
            completed_at: updates.completed_at !== undefined ? updates.completed_at : row.completed_at,
            is_active: updates.is_active !== undefined ? updates.is_active : row.is_active,
            current_turn: updates.current_turn !== undefined ? updates.current_turn : row.current_turn,
            winner_id: winnerId || row.winner_id,
            updated_at: new Date().toISOString()
        }));

        // Recompute player aggregates on game completion
        if (updates.completed_at && updates.players) {
            console.log('[local] Game completed — recomputing player aggregates');
            const gpRows = LocalDB.getTable('game_players').filter(gp => gp.game_id === gameId);
            console.log(`[local] Found ${gpRows.length} game_players for game ${gameId}`);
            gpRows.forEach(gp => {
                recomputePlayerAggregates(gp.player_id);
            });
            console.log('[local] Player aggregates recomputed after game completion');
        }

        return updated[0] || null;
    }

    async function updateGamePlayers(gameId, players) {
        const existingGP = LocalDB.getTable('game_players').filter(gp => gp.game_id === gameId);
        const allPlayers = LocalDB.getTable('players');

        for (const player of players) {
            const playerRecord = allPlayers.find(p => p.name === player.name);
            if (!playerRecord) continue;
            const gp = existingGP.find(g => g.player_id === playerRecord.id);
            if (!gp) continue;

            const isActualWinner = player.finish_rank === 1;
            const count100Plus = countScoresInRange(player.turns, 100, Infinity);
            const count140Plus = countScoresInRange(player.turns, 140, Infinity);

            LocalDB.updateRows('game_players', r => r.id === gp.id, row => ({
                ...row,
                final_score: player.currentScore,
                is_winner: isActualWinner,
                finish_rank: player.finish_rank,
                finish_round: player.finish_round,
                total_turns: player.turns.length,
                total_darts: player.stats.totalDarts,
                total_score: player.stats.totalScore,
                max_dart: player.stats.maxDart,
                max_turn: player.stats.maxTurn,
                count_180s: count100Plus,
                count_140_plus: count140Plus,
                updated_at: new Date().toISOString()
            }));

            // Insert new turns
            const existingTurns = LocalDB.getTable('turns')
                .filter(t => t.game_player_id === gp.id);
            const existingNumbers = new Set(existingTurns.map(t => t.turn_number));

            const newTurns = player.turns
                .map((turn, idx) => ({ turn, number: idx + 1 }))
                .filter(({ number }) => !existingNumbers.has(number))
                .map(({ turn, number }) => ({
                    id: generateUUID(),
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
                LocalDB.insertRows('turns', newTurns);
            }
        }
    }

    async function deleteGame(gameId) {
        // Delete turns for game_players
        const gpIds = LocalDB.getTable('game_players')
            .filter(gp => gp.game_id === gameId)
            .map(gp => gp.id);
        LocalDB.deleteRows('turns', t => gpIds.includes(t.game_player_id));
        LocalDB.deleteRows('game_players', gp => gp.game_id === gameId);
        LocalDB.deleteRows('games', g => g.id === gameId);
        return true;
    }

    async function getActiveGames() {
        const { games } = await getGamesPaginated(1, 20, {
            completed: false,
            active: true
        });
        return games;
    }

    async function getGameCompetitionContext(gameId) {
        const tm = LocalDB.getTable('tournament_matches').find(m => m.game_id === gameId);
        if (tm) {
            return { type: 'tournament', tournament_id: tm.tournament_id, tournament_match_id: tm.id };
        }
        const lm = LocalDB.getTable('league_matches').find(m => m.game_id === gameId);
        if (lm) {
            return { type: 'league', league_id: lm.league_id, league_match_id: lm.id };
        }
        return null;
    }

    // ---------- Players ----------

    async function addPlayer(name) {
        const players = LocalDB.getTable('players');
        if (players.find(p => p.name === name)) {
            return { error: 'A player with this name already exists' };
        }
        const player = {
            id: generateUUID(),
            name: name,
            created_at: new Date().toISOString(),
            total_games_played: 0,
            total_games_won: 0,
            win_rate: 0,
            total_darts_thrown: 0,
            total_score: 0,
            avg_per_dart: 0,
            avg_per_turn: 0,
            max_dart_score: 0,
            max_turn_score: 0,
            total_100s: 0,
            total_140_plus: 0,
            best_checkout: 0,
            checkout_percentage: 0
        };
        LocalDB.insertRows('players', [player]);
        return { data: player };
    }

    async function deletePlayer(id) {
        const players = LocalDB.getTable('players');
        const player = players.find(p => p.id === id);
        if (!player) {
            return { error: 'Player not found' };
        }
        player.is_deleted = true;
        player.updated_at = new Date().toISOString();
        LocalDB.setTable('players', players);
        return { success: true };
    }

    async function renamePlayer(id, newName) {
        const players = LocalDB.getTable('players');
        if (players.find(p => p.name === newName && p.id !== id)) {
            return { error: 'A player with this name already exists' };
        }
        const updated = LocalDB.updateRows('players', r => r.id === id, row => ({
            ...row,
            name: newName
        }));
        if (updated.length === 0) {
            return { error: 'Player not found' };
        }
        return { data: updated[0] };
    }

    async function getPlayers() {
        const players = LocalDB.getTable('players').filter(p => !p.is_deleted);
        const obj = {};
        players.forEach(p => { obj[p.name] = p; });
        return obj;
    }

    async function getPlayerGames(playerName, limit = 50) {
        const players = LocalDB.getTable('players');
        const player = players.find(p => p.name === playerName);
        if (!player) return [];

        const gpRows = LocalDB.getTable('game_players')
            .filter(gp => gp.player_id === player.id);
        const gameIds = gpRows.map(gp => gp.game_id);

        let games = LocalDB.getTable('games')
            .filter(g => gameIds.includes(g.id) && !g.is_practice)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (limit) games = games.slice(0, limit);
        return games.map(transformGameFromDB);
    }

    // ---------- Recompute player aggregates (replaces Supabase trigger) ----------

    function recomputePlayerAggregates(playerId) {
        const gpRows = LocalDB.getTable('game_players').filter(gp => gp.player_id === playerId);
        const games = LocalDB.getTable('games');
        const allTurns = LocalDB.getTable('turns');

        // Only count completed non-practice games
        const completedGPRows = gpRows.filter(gp => {
            const game = games.find(g => g.id === gp.game_id);
            return game && game.completed_at && !game.is_practice;
        });

        const totalGames = completedGPRows.length;
        const totalWins = completedGPRows.filter(gp => gp.is_winner).length;
        let totalDarts = 0, totalScore = 0, totalTurns = 0;
        let maxDart = 0, maxTurn = 0, total100s = 0, total140plus = 0;

        completedGPRows.forEach(gp => {
            const game = games.find(g => g.id === gp.game_id);
            const isPerTurn = game && game.scoring_mode === 'per-turn';

            // Get actual turns for this game_player
            const turns = allTurns.filter(t => t.game_player_id === gp.id);

            if (turns.length > 0) {
                // Compute from actual turn data for accuracy
                turns.forEach(t => {
                    const darts = Array.isArray(t.dart_scores) ? t.dart_scores : [t.turn_total || 0];
                    const turnTotal = darts.reduce((a, b) => a + b, 0);
                    totalScore += turnTotal;
                    totalDarts += isPerTurn ? 3 : darts.length;
                    totalTurns++;
                    if (turnTotal > maxTurn) maxTurn = turnTotal;
                    if (!isPerTurn) {
                        const dartMax = Math.max(...darts);
                        if (dartMax > maxDart) maxDart = dartMax;
                    }
                    if (turnTotal >= 100) total100s++;
                    if (turnTotal >= 140) total140plus++;
                });
            } else {
                // Fallback to game_players aggregates if no turns available
                totalDarts += gp.total_darts || 0;
                totalScore += gp.total_score || 0;
                totalTurns += gp.total_turns || 0;
                if ((gp.max_turn || 0) > maxTurn) maxTurn = gp.max_turn;
                if ((gp.max_dart || 0) > maxDart) maxDart = gp.max_dart;
                total100s += gp.count_180s || 0;
                total140plus += gp.count_140_plus || 0;
            }
        });

        const winRate = totalGames > 0 ? (totalWins / totalGames * 100) : 0;
        const avgPerDart = totalDarts > 0 ? (totalScore / totalDarts) : 0;
        const avgPerTurn = totalTurns > 0 ? (totalScore / totalTurns) : 0;

        LocalDB.updateRows('players', r => r.id === playerId, row => ({
            ...row,
            total_games_played: totalGames,
            total_games_won: totalWins,
            win_rate: winRate,
            total_darts_thrown: totalDarts,
            total_score: totalScore,
            avg_per_dart: avgPerDart,
            avg_per_turn: avgPerTurn,
            max_dart_score: maxDart,
            max_turn_score: maxTurn,
            total_100s: total100s,
            total_140_plus: total140plus,
            best_checkout: row.best_checkout || 0,
            checkout_percentage: row.checkout_percentage || 0
        }));
    }

    /**
     * Recompute aggregates for ALL players (used on init/sync)
     */
    function recomputeAllPlayerAggregates() {
        const players = LocalDB.getTable('players');
        console.log(`[local] Recomputing aggregates for ${players.length} players...`);
        players.forEach(p => recomputePlayerAggregates(p.id));
        console.log('[local] Player aggregates recomputed');
    }

    // ---------- Leaderboard (replaces materialized view) ----------

    function computeLeaderboard() {
        const players = LocalDB.getTable('players').filter(p => (p.total_games_played || 0) > 0 && !p.is_deleted);

        // Sort by various metrics and assign ranks
        const byWins = [...players].sort((a, b) => (b.total_games_won || 0) - (a.total_games_won || 0));
        const byWinRate = [...players].sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0));
        const byAvg = [...players].sort((a, b) => (b.avg_per_turn || 0) - (a.avg_per_turn || 0));

        return players.map(p => {
            const rankByWins = byWins.findIndex(x => x.id === p.id) + 1;
            const rankByWinRate = byWinRate.findIndex(x => x.id === p.id) + 1;
            const rankByAvg = byAvg.findIndex(x => x.id === p.id) + 1;

            return {
                name: p.name,
                total_games_played: p.total_games_played || 0,
                total_games_won: p.total_games_won || 0,
                win_rate: p.win_rate || 0,
                total_darts_thrown: p.total_darts_thrown || 0,
                total_score: p.total_score || 0,
                avg_per_dart: p.avg_per_dart || 0,
                avg_per_turn: p.avg_per_turn || 0,
                max_dart_score: p.max_dart_score || 0,
                max_turn_score: p.max_turn_score || 0,
                total_180s: p.total_100s || 0,
                total_140_plus: p.total_140_plus || 0,
                best_checkout: p.best_checkout || 0,
                checkout_percentage: p.checkout_percentage || 0,
                rank_by_wins: rankByWins,
                rank_by_win_rate: rankByWinRate,
                rank_by_avg: rankByAvg
            };
        });
    }

    // ---------- Export ----------

    async function exportData() {
        const games = await getGames();
        const players = await getPlayers();
        return {
            version: '2.0.0',
            exportDate: new Date().toISOString(),
            games,
            players
        };
    }

    // ============================================================================
    // TOURNAMENT OPERATIONS
    // ============================================================================

    async function saveTournament(tournament) {
        const row = {
            id: tournament.id,
            name: tournament.name,
            created_at: tournament.created_at,
            updated_at: new Date().toISOString(),
            status: tournament.status,
            format: tournament.format,
            game_type: tournament.game_type,
            win_condition: tournament.win_condition,
            scoring_mode: tournament.scoring_mode,
            max_players: tournament.max_players,
            device_id: tournament.device_id,
            winner_id: null
        };
        LocalDB.insertRows('tournaments', [row]);
        return row;
    }

    function transformTournamentFromDB(dbT) {
        if (!dbT) return null;
        const allPlayers = LocalDB.getTable('players');
        const participants = LocalDB.getTable('tournament_participants')
            .filter(tp => tp.tournament_id === dbT.id);
        const matches = LocalDB.getTable('tournament_matches')
            .filter(tm => tm.tournament_id === dbT.id);

        const winnerPlayer = dbT.winner_id ? allPlayers.find(p => p.id === dbT.winner_id) : null;

        return {
            id: dbT.id,
            name: dbT.name,
            created_at: dbT.created_at,
            updated_at: dbT.updated_at,
            status: dbT.status,
            format: dbT.format,
            game_type: dbT.game_type,
            win_condition: dbT.win_condition,
            scoring_mode: dbT.scoring_mode,
            max_players: dbT.max_players,
            device_id: dbT.device_id,
            winner_id: dbT.winner_id,
            winner_name: winnerPlayer?.name,
            participants: participants.map(tp => {
                const player = allPlayers.find(p => p.id === tp.player_id);
                return {
                    id: tp.id,
                    player_id: tp.player_id,
                    name: player?.name || 'Unknown',
                    bracket_position: tp.bracket_position,
                    eliminated: tp.eliminated,
                    eliminated_in_round: tp.eliminated_in_round,
                    final_placement: tp.final_placement
                };
            }),
            matches: matches.map(tm => {
                const p1 = allPlayers.find(p => p.id === tm.player1_id);
                const p2 = allPlayers.find(p => p.id === tm.player2_id);
                const w = allPlayers.find(p => p.id === tm.winner_id);
                return {
                    id: tm.id,
                    tournament_id: dbT.id,
                    round: tm.round,
                    match_number: tm.match_number,
                    player1_id: tm.player1_id,
                    player1_name: p1?.name,
                    player2_id: tm.player2_id,
                    player2_name: p2?.name,
                    winner_id: tm.winner_id,
                    winner_name: w?.name,
                    status: tm.status,
                    game_id: tm.game_id,
                    winner_next_match_id: tm.winner_next_match_id,
                    loser_next_match_id: tm.loser_next_match_id
                };
            })
        };
    }

    async function getTournaments(filters = {}) {
        let tournaments = LocalDB.getTable('tournaments')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (filters.status) tournaments = tournaments.filter(t => t.status === filters.status);
        if (filters.deviceId) tournaments = tournaments.filter(t => t.device_id === filters.deviceId);
        return tournaments.map(transformTournamentFromDB);
    }

    async function getTournament(tournamentId) {
        const t = LocalDB.getTable('tournaments').find(t => t.id === tournamentId);
        return transformTournamentFromDB(t);
    }

    async function updateTournament(tournamentId, updates) {
        let winnerId = null;
        if (updates.winner_name) {
            const player = LocalDB.getTable('players').find(p => p.name === updates.winner_name);
            if (player) winnerId = player.id;
        }
        const updated = LocalDB.updateRows('tournaments', r => r.id === tournamentId, row => ({
            ...row,
            status: updates.status !== undefined ? updates.status : row.status,
            winner_id: winnerId || row.winner_id,
            updated_at: new Date().toISOString()
        }));
        return updated[0] || null;
    }

    async function saveTournamentParticipants(tournamentId, participants) {
        const rows = participants.map(p => {
            const player = getOrCreatePlayer(p.name);
            return {
                id: p.id || generateUUID(),
                tournament_id: tournamentId,
                player_id: player.id,
                bracket_position: p.bracket_position,
                eliminated: p.eliminated || false,
                eliminated_in_round: p.eliminated_in_round || null,
                final_placement: p.final_placement || null
            };
        });
        return LocalDB.insertRows('tournament_participants', rows);
    }

    async function saveTournamentMatches(tournamentId, matches) {
        const playerIds = {};
        for (const m of matches) {
            if (m.player1_name && !playerIds[m.player1_name]) playerIds[m.player1_name] = getOrCreatePlayer(m.player1_name).id;
            if (m.player2_name && !playerIds[m.player2_name]) playerIds[m.player2_name] = getOrCreatePlayer(m.player2_name).id;
            if (m.winner_name && !playerIds[m.winner_name]) playerIds[m.winner_name] = getOrCreatePlayer(m.winner_name).id;
        }
        const rows = matches.map(m => ({
            id: m.id,
            tournament_id: tournamentId,
            round: m.round,
            match_number: m.match_number,
            player1_id: m.player1_name ? playerIds[m.player1_name] : null,
            player2_id: m.player2_name ? playerIds[m.player2_name] : null,
            winner_id: m.winner_name ? playerIds[m.winner_name] : null,
            status: m.status,
            game_id: m.game_id || null,
            winner_next_match_id: m.winner_next_match_id || null,
            loser_next_match_id: m.loser_next_match_id || null
        }));
        return LocalDB.insertRows('tournament_matches', rows);
    }

    async function updateTournamentMatch(matchId, updates) {
        const allPlayers = LocalDB.getTable('players');

        const updated = LocalDB.updateRows('tournament_matches', r => r.id === matchId, row => {
            const result = { ...row, updated_at: new Date().toISOString() };
            if (updates.status !== undefined) result.status = updates.status;
            if (updates.game_id !== undefined) result.game_id = updates.game_id;
            if (updates.player1_id) result.player1_id = updates.player1_id;
            else if (updates.player1_name) {
                const p = allPlayers.find(pl => pl.name === updates.player1_name);
                if (p) result.player1_id = p.id;
            }
            if (updates.player2_id) result.player2_id = updates.player2_id;
            else if (updates.player2_name) {
                const p = allPlayers.find(pl => pl.name === updates.player2_name);
                if (p) result.player2_id = p.id;
            }
            if (updates.winner_name) {
                const w = allPlayers.find(pl => pl.name === updates.winner_name);
                if (w) result.winner_id = w.id;
            }
            return result;
        });
        return updated[0] || null;
    }

    async function updateTournamentParticipant(participantId, updates) {
        const updated = LocalDB.updateRows('tournament_participants', r => r.id === participantId, row => ({
            ...row,
            eliminated: updates.eliminated !== undefined ? updates.eliminated : row.eliminated,
            eliminated_in_round: updates.eliminated_in_round !== undefined ? updates.eliminated_in_round : row.eliminated_in_round,
            final_placement: updates.final_placement !== undefined ? updates.final_placement : row.final_placement
        }));
        return updated[0] || null;
    }

    async function deleteTournamentParticipant(tournamentId, playerName) {
        const player = LocalDB.getTable('players').find(p => p.name === playerName);
        if (!player) return { success: true };
        LocalDB.deleteRows('tournament_participants', tp => tp.tournament_id === tournamentId && tp.player_id === player.id);
        return { success: true };
    }

    async function clearTournamentParticipants(tournamentId) {
        LocalDB.deleteRows('tournament_participants', tp => tp.tournament_id === tournamentId);
        return { success: true };
    }

    async function deleteTournament(tournamentId) {
        LocalDB.deleteRows('tournament_matches', m => m.tournament_id === tournamentId);
        LocalDB.deleteRows('tournament_participants', tp => tp.tournament_id === tournamentId);
        LocalDB.deleteRows('tournaments', t => t.id === tournamentId);
        return { success: true };
    }

    // ============================================================================
    // LEAGUE OPERATIONS
    // ============================================================================

    async function saveLeague(league) {
        const row = {
            id: league.id,
            name: league.name,
            created_at: league.created_at,
            updated_at: new Date().toISOString(),
            status: league.status,
            game_type: league.game_type,
            win_condition: league.win_condition,
            scoring_mode: league.scoring_mode,
            matches_per_pairing: league.matches_per_pairing,
            points_for_win: league.points_for_win,
            points_for_draw: league.points_for_draw,
            points_for_loss: league.points_for_loss,
            device_id: league.device_id,
            winner_id: null
        };
        LocalDB.insertRows('leagues', [row]);
        return row;
    }

    function transformLeagueFromDB(dbL) {
        if (!dbL) return null;
        const allPlayers = LocalDB.getTable('players');
        const participants = LocalDB.getTable('league_participants')
            .filter(lp => lp.league_id === dbL.id);
        const matches = LocalDB.getTable('league_matches')
            .filter(lm => lm.league_id === dbL.id);

        const winnerPlayer = dbL.winner_id ? allPlayers.find(p => p.id === dbL.winner_id) : null;

        return {
            id: dbL.id,
            name: dbL.name,
            created_at: dbL.created_at,
            updated_at: dbL.updated_at,
            status: dbL.status,
            game_type: dbL.game_type,
            win_condition: dbL.win_condition,
            scoring_mode: dbL.scoring_mode,
            matches_per_pairing: dbL.matches_per_pairing,
            points_for_win: dbL.points_for_win,
            points_for_draw: dbL.points_for_draw,
            points_for_loss: dbL.points_for_loss,
            device_id: dbL.device_id,
            winner_id: dbL.winner_id,
            winner_name: winnerPlayer?.name,
            participants: participants.map(lp => {
                const player = allPlayers.find(p => p.id === lp.player_id);
                return {
                    id: lp.id,
                    player_id: lp.player_id,
                    name: player?.name || 'Unknown',
                    matches_played: lp.matches_played,
                    wins: lp.wins,
                    draws: lp.draws,
                    losses: lp.losses,
                    points: lp.points,
                    legs_won: lp.legs_won,
                    legs_lost: lp.legs_lost
                };
            }),
            matches: matches.map(lm => {
                const p1 = allPlayers.find(p => p.id === lm.player1_id);
                const p2 = allPlayers.find(p => p.id === lm.player2_id);
                const w = allPlayers.find(p => p.id === lm.winner_id);
                return {
                    id: lm.id,
                    league_id: dbL.id,
                    player1_id: lm.player1_id,
                    player1_name: p1?.name,
                    player2_id: lm.player2_id,
                    player2_name: p2?.name,
                    winner_id: lm.winner_id,
                    winner_name: w?.name,
                    is_draw: lm.is_draw,
                    status: lm.status,
                    fixture_round: lm.fixture_round,
                    game_id: lm.game_id
                };
            })
        };
    }

    async function getLeagues(filters = {}) {
        let leagues = LocalDB.getTable('leagues')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (filters.status) leagues = leagues.filter(l => l.status === filters.status);
        if (filters.deviceId) leagues = leagues.filter(l => l.device_id === filters.deviceId);
        return leagues.map(transformLeagueFromDB);
    }

    async function getLeague(leagueId) {
        const l = LocalDB.getTable('leagues').find(l => l.id === leagueId);
        return transformLeagueFromDB(l);
    }

    async function updateLeague(leagueId, updates) {
        let winnerId = null;
        if (updates.winner_name) {
            const player = LocalDB.getTable('players').find(p => p.name === updates.winner_name);
            if (player) winnerId = player.id;
        }
        const updated = LocalDB.updateRows('leagues', r => r.id === leagueId, row => ({
            ...row,
            status: updates.status !== undefined ? updates.status : row.status,
            winner_id: winnerId || row.winner_id,
            updated_at: new Date().toISOString()
        }));
        return updated[0] || null;
    }

    async function saveLeagueParticipants(leagueId, participants) {
        const rows = participants.map(p => {
            const player = getOrCreatePlayer(p.name);
            return {
                id: p.id || generateUUID(),
                league_id: leagueId,
                player_id: player.id,
                matches_played: p.matches_played || 0,
                wins: p.wins || 0,
                draws: p.draws || 0,
                losses: p.losses || 0,
                points: p.points || 0,
                legs_won: p.legs_won || 0,
                legs_lost: p.legs_lost || 0
            };
        });
        return LocalDB.insertRows('league_participants', rows);
    }

    async function saveLeagueMatches(leagueId, matches) {
        const playerIds = {};
        for (const m of matches) {
            if (m.player1_name && !playerIds[m.player1_name]) playerIds[m.player1_name] = getOrCreatePlayer(m.player1_name).id;
            if (m.player2_name && !playerIds[m.player2_name]) playerIds[m.player2_name] = getOrCreatePlayer(m.player2_name).id;
        }
        const rows = matches.map(m => ({
            id: m.id,
            league_id: leagueId,
            player1_id: playerIds[m.player1_name],
            player2_id: playerIds[m.player2_name],
            winner_id: m.winner_name ? playerIds[m.winner_name] : null,
            is_draw: m.is_draw || false,
            status: m.status,
            fixture_round: m.fixture_round,
            game_id: m.game_id || null
        }));
        return LocalDB.insertRows('league_matches', rows);
    }

    async function updateLeagueMatch(matchId, updates) {
        const allPlayers = LocalDB.getTable('players');
        const updated = LocalDB.updateRows('league_matches', r => r.id === matchId, row => {
            const result = { ...row, updated_at: new Date().toISOString() };
            if (updates.status !== undefined) result.status = updates.status;
            if (updates.is_draw !== undefined) result.is_draw = updates.is_draw;
            if (updates.game_id !== undefined) result.game_id = updates.game_id;
            if (updates.winner_name) {
                const w = allPlayers.find(p => p.name === updates.winner_name);
                if (w) result.winner_id = w.id;
            } else if (updates.is_draw) {
                result.winner_id = null;
            }
            return result;
        });
        return updated[0] || null;
    }

    async function updateLeagueParticipant(participantId, updates) {
        const updated = LocalDB.updateRows('league_participants', r => r.id === participantId, row => ({
            ...row,
            matches_played: updates.matches_played !== undefined ? updates.matches_played : row.matches_played,
            wins: updates.wins !== undefined ? updates.wins : row.wins,
            draws: updates.draws !== undefined ? updates.draws : row.draws,
            losses: updates.losses !== undefined ? updates.losses : row.losses,
            points: updates.points !== undefined ? updates.points : row.points,
            legs_won: updates.legs_won !== undefined ? updates.legs_won : row.legs_won,
            legs_lost: updates.legs_lost !== undefined ? updates.legs_lost : row.legs_lost
        }));
        return updated[0] || null;
    }

    async function deleteLeague(leagueId) {
        LocalDB.deleteRows('league_matches', m => m.league_id === leagueId);
        LocalDB.deleteRows('league_participants', lp => lp.league_id === leagueId);
        LocalDB.deleteRows('leagues', l => l.id === leagueId);
        return { success: true };
    }

    // ============================================================================
    // NEW QUERY METHODS (for stats.js refactoring)
    // ============================================================================

    async function getPlayerByName(name) {
        return LocalDB.getTable('players').find(p => p.name === name) || null;
    }

    async function getPlayersByNames(names) {
        return LocalDB.getTable('players').filter(p => names.includes(p.name) && !p.is_deleted);
    }

    async function getPlayerLeaderboard(sortCol, limit) {
        let lb = computeLeaderboard();
        // Sort by the requested column
        if (sortCol) {
            const ascending = sortCol.startsWith('rank_by_');
            lb.sort((a, b) => {
                const aVal = a[sortCol] || 0;
                const bVal = b[sortCol] || 0;
                return ascending ? aVal - bVal : bVal - aVal;
            });
        }
        if (limit) lb = lb.slice(0, limit);
        return lb;
    }

    async function getCompletedGamesWithPlayerStats(since) {
        let games = LocalDB.getTable('games').filter(g => g.completed_at != null && !g.is_practice);
        if (since) {
            games = games.filter(g => new Date(g.created_at) >= new Date(since));
        }
        const gpAll = LocalDB.getTable('game_players');
        const allPlayers = LocalDB.getTable('players');

        return games.map(g => ({
            ...g,
            game_players: gpAll
                .filter(gp => gp.game_id === g.id)
                .map(gp => {
                    const player = allPlayers.find(p => p.id === gp.player_id);
                    return { ...gp, player: player ? { id: player.id, name: player.name } : null };
                })
        }));
    }

    async function getGamePlayersByGameIds(gameIds) {
        const gpAll = LocalDB.getTable('game_players');
        const allPlayers = LocalDB.getTable('players');
        return gpAll
            .filter(gp => gameIds.includes(gp.game_id))
            .map(gp => {
                const player = allPlayers.find(p => p.id === gp.player_id);
                return { ...gp, player: player ? { name: player.name } : null };
            });
    }

    async function getTurnsForPlayer(playerId) {
        const games = LocalDB.getTable('games');
        const gpRows = LocalDB.getTable('game_players').filter(gp => {
            if (gp.player_id !== playerId) return false;
            const game = games.find(g => g.id === gp.game_id);
            return game && !game.is_practice;
        });
        const gpIds = gpRows.map(gp => gp.id);
        return LocalDB.getTable('turns').filter(t => gpIds.includes(t.game_player_id));
    }

    async function getHeadToHeadGames(p1Id, p2Id) {
        const games = LocalDB.getTable('games').filter(g => g.completed_at != null && !g.is_practice);
        const gpAll = LocalDB.getTable('game_players');

        return games.filter(g => {
            const gps = gpAll.filter(gp => gp.game_id === g.id);
            return gps.some(gp => gp.player_id === p1Id) && gps.some(gp => gp.player_id === p2Id);
        }).map(g => ({
            ...g,
            game_players: gpAll.filter(gp => gp.game_id === g.id)
        }));
    }

    async function countCompletedGames() {
        return LocalDB.getTable('games').filter(g => g.completed_at != null && !g.is_practice).length;
    }

    async function countPlayersWithGames() {
        return LocalDB.getTable('players').filter(p => (p.total_games_played || 0) > 0 && !p.is_deleted).length;
    }

    async function getGamesForPlayer(playerId) {
        const gpRows = LocalDB.getTable('game_players').filter(gp => gp.player_id === playerId);
        const gameIds = gpRows.map(gp => gp.game_id);
        const games = LocalDB.getTable('games').filter(g => gameIds.includes(g.id) && !g.is_practice);
        const gpAll = LocalDB.getTable('game_players');
        const allPlayers = LocalDB.getTable('players');

        return games.map(g => ({
            ...g,
            game_players: gpAll.filter(gp => gp.game_id === g.id).map(gp => ({
                ...gp,
                player: allPlayers.find(p => p.id === gp.player_id) || { name: 'Unknown' }
            }))
        }));
    }

    async function getDeletedPlayers() {
        return LocalDB.getTable('players').filter(p => p.is_deleted);
    }

    async function restorePlayer(id) {
        const players = LocalDB.getTable('players');
        const player = players.find(p => p.id === id);
        if (!player) return { error: 'Player not found' };
        player.is_deleted = false;
        player.updated_at = new Date().toISOString();
        LocalDB.setTable('players', players);
        return { success: true };
    }

    async function getAllPlayersWithStats() {
        return LocalDB.getTable('players').filter(p => (p.total_games_played || 0) > 0 && !p.is_deleted);
    }

    // Public API
    return {
        init,
        getGames,
        getGamesPaginated,
        getActiveGames,
        saveGame,
        updateGame,
        getGame,
        getGameCompetitionContext,
        deleteGame,
        getPlayers,
        addPlayer,
        deletePlayer,
        restorePlayer,
        getDeletedPlayers,
        renamePlayer,
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
        deleteTournamentParticipant,
        clearTournamentParticipants,
        deleteTournament,
        // League operations
        saveLeague,
        getLeagues,
        getLeague,
        updateLeague,
        saveLeagueParticipants,
        saveLeagueMatches,
        updateLeagueMatch,
        updateLeagueParticipant,
        deleteLeague,
        // New query methods for stats.js
        getPlayerByName,
        getPlayersByNames,
        getPlayerLeaderboard,
        getCompletedGamesWithPlayerStats,
        getGamePlayersByGameIds,
        getTurnsForPlayer,
        getHeadToHeadGames,
        countCompletedGames,
        countPlayersWithGames,
        getGamesForPlayer,
        getAllPlayersWithStats,
        // Aggregation
        recomputePlayerAggregates,
        recomputeAllPlayerAggregates,
        computeLeaderboard
    };
})();
