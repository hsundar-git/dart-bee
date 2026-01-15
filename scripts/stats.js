/**
 * Statistics Module
 * Calculates and aggregates player statistics
 * OPTIMIZED for normalized database schema with materialized views
 */

const Stats = (() => {
    /**
     * Get Supabase client with retry
     */
    function getSupabaseClient() {
        const sb = Storage.sb;
        if (!sb) {
            throw new Error('Supabase client not initialized. Please wait for Storage.init() to complete.');
        }
        return sb;
    }

    /**
     * Calculate player statistics from database aggregates
     * OPTIMIZED: Single query to players table instead of looping through games
     */
    async function calculatePlayerStats(playerName) {
        // Get player aggregates from database (single query)
        const { data: player, error } = await getSupabaseClient()
            .from('players')
            .select('*')
            .eq('name', playerName)
            .single();

        if (error || !player) {
            console.error('Error fetching player stats:', error);
            return getEmptyStats();
        }

        // Get recent games for this player
        const recentGames = await Storage.getPlayerGames(playerName, 5);

        // Calculate head-to-head records
        const headToHead = await calculateHeadToHead(playerName);

        const stats = {
            gamesPlayed: player.total_games_played || 0,
            gamesWon: player.total_games_won || 0,
            winRate: player.win_rate ? parseFloat(player.win_rate).toFixed(1) : '0.0',
            totalDarts: player.total_darts_thrown || 0,
            totalScore: player.total_score || 0,
            avgPerDart: player.avg_per_dart ? parseFloat(player.avg_per_dart).toFixed(2) : '0.00',
            avgPerTurn: player.avg_per_turn ? parseFloat(player.avg_per_turn).toFixed(2) : '0.00',
            maxDart: player.max_dart_score || 0,
            maxTurn: player.max_turn_score || 0,
            total100s: player.total_100s || 0,
            total140plus: player.total_140_plus || 0,
            bestCheckout: player.best_checkout || 0,
            checkoutPercentage: player.checkout_percentage
                ? parseFloat(player.checkout_percentage).toFixed(1)
                : '0.0',
            headToHead: headToHead,
            recentGames: recentGames.slice(0, 5).map(game => {
                const playerData = game.players.find(p => p.name === playerName);
                return {
                    id: game.id,
                    date: new Date(game.created_at).toLocaleDateString(),
                    opponent: game.players.filter(p => p.name !== playerName).map(p => p.name).join(', '),
                    won: playerData?.winner || false,
                    darts: playerData?.stats.totalDarts || 0,
                    score: playerData?.stats.totalScore || 0
                };
            })
        };

        return stats;
    }

    /**
     * Calculate head-to-head records for a player
     * OPTIMIZED: Uses game_players junction table with JOIN
     */
    async function calculateHeadToHead(playerName) {
        // Get player ID
        const { data: playerData } = await getSupabaseClient()
            .from('players')
            .select('id')
            .eq('name', playerName)
            .single();

        if (!playerData) return {};

        // Query games where this player participated
        const { data: gamePlayerRecords } = await getSupabaseClient()
            .from('game_players')
            .select(`
                game_id,
                is_winner,
                game:games!inner(
                    id,
                    completed_at,
                    game_players!inner(
                        player:players!inner(name),
                        is_winner
                    )
                )
            `)
            .eq('player_id', playerData.id)
            .not('game.completed_at', 'is', null);

        const headToHead = {};

        (gamePlayerRecords || []).forEach(gp => {
            const game = gp.game;
            if (!game || !game.game_players) return;

            // Find opponents in this game
            game.game_players.forEach(opponent => {
                if (opponent.player.name === playerName) return;

                const opponentName = opponent.player.name;
                if (!headToHead[opponentName]) {
                    headToHead[opponentName] = { wins: 0, losses: 0 };
                }

                if (gp.is_winner) {
                    headToHead[opponentName].wins++;
                } else if (opponent.is_winner) {
                    headToHead[opponentName].losses++;
                }
            });
        });

        return headToHead;
    }

    /**
     * Get leaderboard rankings from materialized view
     * OPTIMIZED: Single query instead of N+1 pattern
     */
    async function getLeaderboard(metric = 'wins', timeFilter = 'all-time') {
        // Determine which column to sort by
        const sortConfig = {
            'wins': { column: 'rank_by_wins', ascending: true },
            'win-rate': { column: 'rank_by_win_rate', ascending: true },
            'avg-turn': { column: 'rank_by_avg', ascending: true },
            '100s': { column: 'total_180s', ascending: false },  // DB column is still total_180s, displayed as 100+
            'max-turn': { column: 'max_turn_score', ascending: false }  // Sort by value descending
        }[metric] || { column: 'rank_by_wins', ascending: true };

        // For time-based filtering, we need to query games directly
        // For all-time, use the materialized view
        if (timeFilter === 'all-time') {
            const { data, error } = await getSupabaseClient()
                .from('player_leaderboard')
                .select('*')
                .order(sortConfig.column, { ascending: sortConfig.ascending })
                .limit(100);

            if (error) {
                console.error('Error fetching leaderboard:', error);
                return [];
            }

            return (data || []).map((player, index) => ({
                rank: index + 1,
                name: player.name,
                metric: getMetricValue(metric, player),
                stats: {
                    gamesPlayed: player.total_games_played,
                    gamesWon: player.total_games_won,
                    winRate: parseFloat(player.win_rate || 0).toFixed(1),
                    totalDarts: player.total_darts_thrown,
                    total100s: player.total_180s || 0,  // DB column is total_180s, displayed as 100+
                    avgPerDart: parseFloat(player.avg_per_dart || 0).toFixed(2),
                    avgPerTurn: parseFloat(player.avg_per_turn || 0).toFixed(2),
                    maxTurn: player.max_turn_score || 0
                },
                fullStats: {
                    gamesPlayed: player.total_games_played,
                    gamesWon: player.total_games_won,
                    winRate: parseFloat(player.win_rate || 0).toFixed(1),
                    totalDarts: player.total_darts_thrown,
                    totalScore: player.total_score,
                    avgPerDart: parseFloat(player.avg_per_dart || 0).toFixed(2),
                    avgPerTurn: parseFloat(player.avg_per_turn || 0).toFixed(2),
                    maxDart: player.max_dart_score,
                    maxTurn: player.max_turn_score,
                    total100s: player.total_180s || 0,  // DB column is total_180s, displayed as 100+
                    total140plus: player.total_140_plus,
                    bestCheckout: player.best_checkout,
                    checkoutPercentage: parseFloat(player.checkout_percentage || 0).toFixed(1)
                }
            }));
        } else {
            // For time-filtered leaderboards, calculate on-the-fly
            return await getTimeFilteredLeaderboard(metric, timeFilter);
        }
    }

    /**
     * Get time-filtered leaderboard (7-day, 30-day)
     * Less optimized than all-time, but still better than old N+1 pattern
     */
    async function getTimeFilteredLeaderboard(metric, timeFilter) {
        const cutoffDate = getTimeFilterDate(timeFilter);
        const cutoffISO = new Date(cutoffDate).toISOString();

        // Get all games in the time period with player stats
        const { data: games } = await getSupabaseClient()
            .from('games')
            .select(`
                id,
                created_at,
                completed_at,
                game_players!inner(
                    player_id,
                    is_winner,
                    total_darts,
                    total_score,
                    total_turns,
                    max_turn,
                    player:players!inner(id, name)
                )
            `)
            .gte('created_at', cutoffISO)
            .not('completed_at', 'is', null);

        // Aggregate stats per player
        const playerStatsMap = {};

        (games || []).forEach(game => {
            game.game_players.forEach(gp => {
                const playerName = gp.player.name;
                if (!playerStatsMap[playerName]) {
                    playerStatsMap[playerName] = {
                        gamesPlayed: 0,
                        gamesWon: 0,
                        totalDarts: 0,
                        totalScore: 0,
                        totalTurns: 0,
                        total100s: 0,
                        maxTurn: 0
                    };
                }

                const stats = playerStatsMap[playerName];
                stats.gamesPlayed++;
                if (gp.is_winner) stats.gamesWon++;
                stats.totalDarts += gp.total_darts || 0;
                stats.totalScore += gp.total_score || 0;
                stats.totalTurns += gp.total_turns || 0;
                stats.total100s += gp.count_180s || 0;
                stats.maxTurn = Math.max(stats.maxTurn, gp.max_turn || 0);
            });
        });

        // Convert to leaderboard format
        const rankings = Object.entries(playerStatsMap).map(([name, stats]) => {
            const winRate = stats.gamesPlayed > 0
                ? (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1)
                : '0.0';
            const avgPerDart = stats.totalDarts > 0
                ? (stats.totalScore / stats.totalDarts).toFixed(2)
                : '0.00';

            const playerStats = {
                gamesPlayed: stats.gamesPlayed,
                gamesWon: stats.gamesWon,
                winRate: winRate,
                totalDarts: stats.totalDarts,
                total100s: stats.total100s,
                avgPerDart: avgPerDart,
                avgPerTurn: stats.totalTurns > 0 ? (stats.totalScore / stats.totalTurns).toFixed(2) : '0.00',
                maxTurn: stats.maxTurn
            };

            return {
                name: name,
                metric: getMetricValue(metric, playerStats),
                stats: playerStats,
                fullStats: playerStats
            };
        });

        // Sort by metric
        rankings.sort((a, b) => {
            const aVal = parseFloat(a.metric) || 0;
            const bVal = parseFloat(b.metric) || 0;
            return bVal - aVal;
        });

        // Add rank numbers
        return rankings.map((r, i) => ({ ...r, rank: i + 1 }));
    }

    /**
     * Calculate stats for specific games (used by time-filtered leaderboards)
     */
    function calculateStatsForGames(gamesArray, playerName) {
        const stats = {
            gamesPlayed: 0,
            gamesWon: 0,
            winRate: 0,
            totalDarts: 0,
            total100s: 0,
            avgPerDart: 0
        };

        let totalTurns = 0;
        let totalScore = 0;

        gamesArray.forEach(game => {
            const player = game.players.find(p => p.name === playerName);
            if (!player) return;

            stats.gamesPlayed++;
            if (player.winner) {
                stats.gamesWon++;
            }

            stats.totalDarts += player.stats.totalDarts || 0;
            totalScore += player.stats.totalScore || 0;
            totalTurns += player.turns?.length || 0;

            (player.turns || []).forEach(turn => {
                const turnTotal = turn.darts.reduce((a, b) => a + b, 0);
                if (turnTotal >= 100) {
                    stats.total100s++;
                }
            });
        });

        // Calculate average per dart
        if (stats.totalDarts > 0) {
            stats.avgPerDart = (totalScore / stats.totalDarts).toFixed(2);
        }

        if (stats.gamesPlayed > 0) {
            stats.winRate = (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1);
        }

        return stats;
    }

    /**
     * Get time filter date
     */
    function getTimeFilterDate(filter) {
        const now = Date.now();
        switch (filter) {
            case '7-days':
                return now - (7 * 24 * 60 * 60 * 1000);
            case '30-days':
                return now - (30 * 24 * 60 * 60 * 1000);
            case 'all-time':
            default:
                return 0;
        }
    }

    /**
     * Get metric value for ranking
     */
    function getMetricValue(metric, stats) {
        switch (metric) {
            case 'wins':
                return stats.gamesWon || stats.total_games_won || 0;
            case 'win-rate':
                return parseFloat(stats.winRate || stats.win_rate || 0);
            case 'avg-turn':
                return parseFloat(stats.avgPerTurn || stats.avg_per_turn || stats.avgPerDart || stats.avg_per_dart || 0);
            case '100s':
                return stats.total100s || stats.total_180s || 0;  // DB column is total_180s
            case 'max-turn':
                return stats.maxTurn || stats.max_turn_score || stats.max_turn || 0;
            default:
                return 0;
        }
    }

    /**
     * Get quick stats overview for home page
     * OPTIMIZED: Simple COUNT queries instead of loading all data
     */
    async function getQuickStats() {
        // Parallel queries for maximum speed
        const [gamesResult, playersResult, topPlayerResult] = await Promise.all([
            // Total completed games
            getSupabaseClient()
                .from('games')
                .select('*', { count: 'exact', head: true })
                .not('completed_at', 'is', null),

            // Total players with at least one game
            getSupabaseClient()
                .from('players')
                .select('*', { count: 'exact', head: true })
                .gt('total_games_played', 0),

            // Top player by average per turn
            getSupabaseClient()
                .from('player_leaderboard')
                .select('name, avg_per_turn, rank_by_avg')
                .order('rank_by_avg', { ascending: true })
                .limit(1)
                .single()
        ]);

        return {
            totalGames: gamesResult.count || 0,
            totalPlayers: playersResult.count || 0,
            topPlayer: topPlayerResult.data?.name || null,
            highestAvg: topPlayerResult.data?.avg_per_turn
                ? parseFloat(topPlayerResult.data.avg_per_turn).toFixed(2)
                : '0.00'
        };
    }

    /**
     * Format stat value for display
     */
    function formatStat(value, type = 'number') {
        if (value === null || value === undefined) return '—';

        switch (type) {
            case 'percentage':
                return `${parseFloat(value).toFixed(1)}%`;
            case 'decimal':
                return parseFloat(value).toFixed(2);
            case 'integer':
                return Math.floor(value);
            default:
                return value.toString();
        }
    }

    /**
     * Get comparison between two players
     */
    async function comparePlayerStats(playerName1, playerName2) {
        const [stats1, stats2, headToHead] = await Promise.all([
            calculatePlayerStats(playerName1),
            calculatePlayerStats(playerName2),
            getHeadToHeadRecord(playerName1, playerName2)
        ]);

        return {
            player1: { name: playerName1, ...stats1 },
            player2: { name: playerName2, ...stats2 },
            headToHeadRecord: headToHead
        };
    }

    /**
     * Get head to head record between two players
     * OPTIMIZED: Uses junction table query
     */
    async function getHeadToHeadRecord(playerName1, playerName2) {
        // Get player IDs
        const { data: players } = await getSupabaseClient()
            .from('players')
            .select('id, name')
            .in('name', [playerName1, playerName2]);

        if (!players || players.length !== 2) {
            return { wins: 0, losses: 0, total: 0 };
        }

        const player1Id = players.find(p => p.name === playerName1)?.id;
        const player2Id = players.find(p => p.name === playerName2)?.id;

        // Query games where BOTH players participated
        const { data: games } = await getSupabaseClient()
            .from('games')
            .select(`
                id,
                completed_at,
                game_players!inner(
                    player_id,
                    is_winner
                )
            `)
            .not('completed_at', 'is', null);

        let wins1 = 0, wins2 = 0;

        (games || []).forEach(game => {
            const player1Data = game.game_players.find(gp => gp.player_id === player1Id);
            const player2Data = game.game_players.find(gp => gp.player_id === player2Id);

            // Only count games where both players participated
            if (player1Data && player2Data) {
                if (player1Data.is_winner) wins1++;
                else if (player2Data.is_winner) wins2++;
            }
        });

        return { wins: wins1, losses: wins2, total: wins1 + wins2 };
    }

    /**
     * Get turn score distribution for charts
     * Returns count of turns in different score ranges
     */
    async function getScoreDistribution(playerName) {
        // Get player ID
        const { data: playerData } = await getSupabaseClient()
            .from('players')
            .select('id')
            .eq('name', playerName)
            .single();

        if (!playerData) {
            return { low: 0, medium: 0, good: 0, high: 0, perfect: 0 };
        }

        // Get all turns for this player
        const { data: turns } = await getSupabaseClient()
            .from('turns')
            .select(`
                turn_total,
                game_player:game_players!inner(
                    player_id
                )
            `)
            .eq('game_player.player_id', playerData.id);

        const distribution = {
            low: 0,      // 0-59
            medium: 0,   // 60-99
            good: 0,     // 100-139
            high: 0,     // 140-179
            perfect: 0   // 180
        };

        (turns || []).forEach(turn => {
            const score = turn.turn_total || 0;
            if (score === 180) {
                distribution.perfect++;
            } else if (score >= 140) {
                distribution.high++;
            } else if (score >= 100) {
                distribution.good++;
            } else if (score >= 60) {
                distribution.medium++;
            } else {
                distribution.low++;
            }
        });

        return distribution;
    }

    /**
     * Get recent game performance data for charts
     * Returns array of {date, avgPerDart, won, darts, score} objects
     */
    async function getRecentPerformance(playerName, limit = 10) {
        const games = await Storage.getPlayerGames(playerName, limit);

        return games.map(game => {
            const playerData = game.players.find(p => p.name === playerName);
            const darts = playerData?.stats?.totalDarts || 0;
            const score = playerData?.stats?.totalScore || 0;

            return {
                id: game.id,
                date: new Date(game.created_at).toLocaleDateString(),
                avgPerDart: darts > 0 ? (score / darts).toFixed(2) : '0.00',
                won: playerData?.winner || false,
                darts: darts,
                score: score
            };
        });
    }

    /**
     * Get comprehensive global statistics
     * Used for the main Stats page
     */
    async function getGlobalStats() {
        try {
            // Get all aggregated data in parallel
            const [
                gamesResult,
                playersResult,
                leaderboardResult,
                totalsResult
            ] = await Promise.all([
                // Total completed games
                getSupabaseClient()
                    .from('games')
                    .select('*', { count: 'exact', head: true })
                    .not('completed_at', 'is', null),

                // Get all players with stats
                getSupabaseClient()
                    .from('players')
                    .select('*')
                    .gt('total_games_played', 0),

                // Get leaderboard
                getSupabaseClient()
                    .from('player_leaderboard')
                    .select('*')
                    .order('rank_by_wins', { ascending: true })
                    .limit(10),

                // Get sum totals
                getSupabaseClient()
                    .from('players')
                    .select('total_darts_thrown, total_score, total_100s, total_140_plus, total_games_played, total_games_won')
            ]);

            // Calculate aggregated totals
            const players = playersResult.data || [];
            const totals = totalsResult.data || [];

            let totalDarts = 0;
            let totalScore = 0;
            let total100s = 0;
            let total140plus = 0;
            let totalGames = 0;
            let totalWins = 0;
            let highestAvg = 0;
            let highestAvgPlayer = '';
            let most100s = 0;
            let most100sPlayer = '';
            let highestMaxTurn = 0;
            let highestMaxTurnPlayer = '';

            players.forEach(p => {
                totalDarts += p.total_darts_thrown || 0;
                totalScore += p.total_score || 0;
                total100s += p.total_100s || 0;
                total140plus += p.total_140_plus || 0;
                totalGames += p.total_games_played || 0;
                totalWins += p.total_games_won || 0;

                const avg = parseFloat(p.avg_per_turn) || 0;
                if (avg > highestAvg) {
                    highestAvg = avg;
                    highestAvgPlayer = p.name;
                }

                if ((p.total_100s || 0) > most100s) {
                    most100s = p.total_100s || 0;
                    most100sPlayer = p.name;
                }

                if ((p.max_turn_score || 0) > highestMaxTurn) {
                    highestMaxTurn = p.max_turn_score || 0;
                    highestMaxTurnPlayer = p.name;
                }
            });

            return {
                totalGames: gamesResult.count || 0,
                totalPlayers: players.length,
                totalDarts,
                totalScore,
                total100s,
                total140plus,
                averagePerDart: totalDarts > 0 ? (totalScore / totalDarts).toFixed(2) : '0.00',
                records: {
                    highestAvg: highestAvg.toFixed(2),
                    highestAvgPlayer,
                    most100s,
                    most100sPlayer,
                    highestMaxTurn,
                    highestMaxTurnPlayer
                },
                topPlayers: leaderboardResult.data || [],
                players: players.map(p => ({
                    name: p.name,
                    gamesPlayed: p.total_games_played,
                    gamesWon: p.total_games_won
                }))
            };
        } catch (e) {
            console.error('Error getting global stats:', e);
            return {
                totalGames: 0,
                totalPlayers: 0,
                totalDarts: 0,
                totalScore: 0,
                total100s: 0,
                total140plus: 0,
                averagePerDart: '0.00',
                records: {},
                topPlayers: [],
                players: []
            };
        }
    }

    /**
     * Get all player names for dropdown
     */
    async function getAllPlayerNames() {
        try {
            const { data } = await getSupabaseClient()
                .from('players')
                .select('name')
                .gt('total_games_played', 0)
                .order('name');

            return (data || []).map(p => p.name);
        } catch (e) {
            console.error('Error getting player names:', e);
            return [];
        }
    }

    /**
     * Get empty stats object
     */
    function getEmptyStats() {
        return {
            gamesPlayed: 0,
            gamesWon: 0,
            winRate: '0.0',
            totalDarts: 0,
            totalScore: 0,
            avgPerDart: '0.00',
            avgPerTurn: '0.00',
            maxDart: 0,
            maxTurn: 0,
            total100s: 0,
            total140plus: 0,
            bestCheckout: 0,
            checkoutPercentage: '0.0',
            headToHead: {},
            recentGames: []
        };
    }

    // Public API
    return {
        calculatePlayerStats,
        getLeaderboard,
        calculateStatsForGames,
        getTimeFilterDate,
        getMetricValue,
        getQuickStats,
        formatStat,
        comparePlayerStats,
        getHeadToHeadRecord,
        getScoreDistribution,
        getRecentPerformance,
        getGlobalStats,
        getAllPlayerNames
    };
})();
