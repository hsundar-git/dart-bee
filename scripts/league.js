/**
 * League Module
 * Handles league creation, fixture generation, and standings management
 * Supports round-robin format with customizable points system
 */

const League = (() => {
    /**
     * Create a new league
     */
    function create(options) {
        const {
            name,
            gameType = 501,
            winCondition = 'exact',
            scoringMode = 'per-dart',
            matchesPerPairing = 1,
            pointsForWin = 3,
            pointsForDraw = 1,
            pointsForLoss = 0,
            playerNames = []
        } = options;

        const league = {
            id: Storage.generateUUID(),
            name: name || `League ${new Date().toLocaleDateString()}`,
            created_at: new Date().toISOString(),
            status: 'registration',
            game_type: gameType,
            win_condition: winCondition,
            scoring_mode: scoringMode,
            matches_per_pairing: matchesPerPairing,
            points_for_win: pointsForWin,
            points_for_draw: pointsForDraw,
            points_for_loss: pointsForLoss,
            device_id: Device.getDeviceId(),
            participants: [],
            matches: []
        };

        return league;
    }

    /**
     * Add a participant to the league
     */
    function addParticipant(league, playerName) {
        if (league.status !== 'registration') {
            return { success: false, error: 'League is not in registration phase' };
        }

        // Check for duplicate
        if (league.participants.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            return { success: false, error: 'Player already registered' };
        }

        const participant = {
            id: Storage.generateUUID(),
            name: playerName.trim(),
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            points: 0,
            legs_won: 0,
            legs_lost: 0
        };

        league.participants.push(participant);
        return { success: true, participant };
    }

    /**
     * Remove a participant from the league
     */
    function removeParticipant(league, playerName) {
        if (league.status !== 'registration') {
            return { success: false, error: 'League is not in registration phase' };
        }

        const index = league.participants.findIndex(
            p => p.name.toLowerCase() === playerName.toLowerCase()
        );

        if (index === -1) {
            return { success: false, error: 'Player not found' };
        }

        league.participants.splice(index, 1);
        return { success: true };
    }

    /**
     * Generate fixtures (round-robin schedule)
     */
    function generateFixtures(league) {
        if (league.status !== 'registration') {
            return { success: false, error: 'League is not in registration phase' };
        }

        const playerCount = league.participants.length;
        if (playerCount < 2) {
            return { success: false, error: 'Need at least 2 players' };
        }

        // Clear existing matches
        league.matches = [];

        // Generate round-robin fixtures
        const fixtures = generateRoundRobinFixtures(league.participants);

        // Create match objects
        let matchNumber = 1;
        fixtures.forEach((roundFixtures, roundIndex) => {
            roundFixtures.forEach(fixture => {
                const match = {
                    id: Storage.generateUUID(),
                    league_id: league.id,
                    player1_id: fixture.player1.id,
                    player1_name: fixture.player1.name,
                    player2_id: fixture.player2.id,
                    player2_name: fixture.player2.name,
                    winner_id: null,
                    winner_name: null,
                    is_draw: false,
                    status: 'pending',
                    fixture_round: roundIndex + 1,
                    game_id: null,
                    match_number: matchNumber++
                };
                league.matches.push(match);
            });
        });

        // If double round-robin, duplicate fixtures with reversed home/away
        if (league.matches_per_pairing === 2) {
            const returnFixtures = league.matches.map(m => ({
                id: Storage.generateUUID(),
                league_id: league.id,
                player1_id: m.player2_id,
                player1_name: m.player2_name,
                player2_id: m.player1_id,
                player2_name: m.player1_name,
                winner_id: null,
                winner_name: null,
                is_draw: false,
                status: 'pending',
                fixture_round: m.fixture_round + fixtures.length,
                game_id: null,
                match_number: matchNumber++
            }));
            league.matches = [...league.matches, ...returnFixtures];
        }

        league.status = 'in_progress';
        return { success: true, matches: league.matches };
    }

    /**
     * Generate round-robin fixtures using circle method
     */
    function generateRoundRobinFixtures(participants) {
        const players = [...participants];
        const rounds = [];

        // If odd number of players, add a "bye" player
        if (players.length % 2 !== 0) {
            players.push({ id: 'bye', name: 'BYE', isBye: true });
        }

        const n = players.length;
        const numRounds = n - 1;
        const halfSize = n / 2;

        // Create a copy for rotation
        const playerIndices = players.map((_, i) => i);

        for (let round = 0; round < numRounds; round++) {
            const roundFixtures = [];

            for (let i = 0; i < halfSize; i++) {
                const home = playerIndices[i];
                const away = playerIndices[n - 1 - i];

                // Skip matches with "bye" player
                if (!players[home].isBye && !players[away].isBye) {
                    roundFixtures.push({
                        player1: players[home],
                        player2: players[away]
                    });
                }
            }

            rounds.push(roundFixtures);

            // Rotate players (keep first player fixed)
            const last = playerIndices.pop();
            playerIndices.splice(1, 0, last);
        }

        return rounds;
    }

    /**
     * Start a match (create the game)
     */
    function startMatch(league, matchId) {
        const match = league.matches.find(m => m.id === matchId);
        if (!match) {
            return { success: false, error: 'Match not found' };
        }

        if (match.status === 'completed') {
            return { success: false, error: 'Match already completed' };
        }

        if (match.status === 'in_progress') {
            return { success: false, error: 'Match already in progress' };
        }

        // Create the game
        const game = Game.createGame({
            playerCount: 2,
            playerNames: [match.player1_name, match.player2_name],
            gameType: league.game_type,
            winBelow: league.win_condition === 'below',
            scoringMode: league.scoring_mode
        });

        // Add league context to game
        game.league_id = league.id;
        game.league_match_id = match.id;

        match.game_id = game.id;
        match.status = 'in_progress';

        return { success: true, game, match };
    }

    /**
     * Record match result
     */
    function recordMatchResult(league, matchId, winnerId, winnerName, isDraw = false) {
        const match = league.matches.find(m => m.id === matchId);
        if (!match) {
            return { success: false, error: 'Match not found' };
        }

        match.winner_id = isDraw ? null : winnerId;
        match.winner_name = isDraw ? null : winnerName;
        match.is_draw = isDraw;
        match.status = 'completed';

        // Update participant standings
        const player1 = league.participants.find(p => p.id === match.player1_id);
        const player2 = league.participants.find(p => p.id === match.player2_id);

        if (player1 && player2) {
            player1.matches_played++;
            player2.matches_played++;

            if (isDraw) {
                player1.draws++;
                player2.draws++;
                player1.points += league.points_for_draw;
                player2.points += league.points_for_draw;
            } else if (winnerId === player1.id) {
                player1.wins++;
                player2.losses++;
                player1.points += league.points_for_win;
                player2.points += league.points_for_loss;
                player1.legs_won++;
                player2.legs_lost++;
            } else {
                player2.wins++;
                player1.losses++;
                player2.points += league.points_for_win;
                player1.points += league.points_for_loss;
                player2.legs_won++;
                player1.legs_lost++;
            }
        }

        // Check if league is complete
        checkLeagueComplete(league);

        return { success: true, match };
    }

    /**
     * Check if league is complete
     */
    function checkLeagueComplete(league) {
        const allCompleted = league.matches.every(m => m.status === 'completed');

        if (allCompleted) {
            league.status = 'completed';

            // Determine winner (highest points, then head-to-head)
            const standings = getStandings(league);
            if (standings.length > 0) {
                league.winner_id = standings[0].id;
                league.winner_name = standings[0].name;
            }

            return true;
        }

        return false;
    }

    /**
     * Get league standings sorted by points and tiebreakers
     */
    function getStandings(league) {
        return [...league.participants]
            .map(p => ({
                ...p,
                leg_difference: p.legs_won - p.legs_lost
            }))
            .sort((a, b) => {
                // Primary: Points (descending)
                if (b.points !== a.points) {
                    return b.points - a.points;
                }

                // Secondary: Head-to-head
                const h2h = getHeadToHead(league, a.id, b.id);
                if (h2h.winner) {
                    return h2h.winner === a.id ? -1 : 1;
                }

                // Tertiary: Leg difference (descending)
                if (b.leg_difference !== a.leg_difference) {
                    return b.leg_difference - a.leg_difference;
                }

                // Quaternary: Legs won (descending)
                return b.legs_won - a.legs_won;
            })
            .map((p, index) => ({
                rank: index + 1,
                id: p.id,
                name: p.name,
                played: p.matches_played,
                wins: p.wins,
                draws: p.draws,
                losses: p.losses,
                points: p.points,
                legDiff: p.leg_difference,
                legsWon: p.legs_won,
                legsLost: p.legs_lost
            }));
    }

    /**
     * Get head-to-head record between two players
     */
    function getHeadToHead(league, player1Id, player2Id) {
        const matches = league.matches.filter(m =>
            m.status === 'completed' &&
            ((m.player1_id === player1Id && m.player2_id === player2Id) ||
             (m.player1_id === player2Id && m.player2_id === player1Id))
        );

        let player1Wins = 0;
        let player2Wins = 0;
        let draws = 0;

        matches.forEach(m => {
            if (m.is_draw) {
                draws++;
            } else if (m.winner_id === player1Id) {
                player1Wins++;
            } else if (m.winner_id === player2Id) {
                player2Wins++;
            }
        });

        return {
            matches: matches.length,
            player1Wins,
            player2Wins,
            draws,
            winner: player1Wins > player2Wins ? player1Id :
                    player2Wins > player1Wins ? player2Id : null
        };
    }

    /**
     * Get fixtures grouped by round
     */
    function getFixturesByRound(league) {
        const rounds = {};

        league.matches.forEach(match => {
            const round = match.fixture_round || 1;
            if (!rounds[round]) {
                rounds[round] = [];
            }
            rounds[round].push(match);
        });

        // Sort matches within each round
        Object.keys(rounds).forEach(round => {
            rounds[round].sort((a, b) => a.match_number - b.match_number);
        });

        return rounds;
    }

    /**
     * Get player's fixtures
     */
    function getPlayerFixtures(league, playerId) {
        return league.matches.filter(m =>
            m.player1_id === playerId || m.player2_id === playerId
        ).map(m => ({
            ...m,
            opponent: m.player1_id === playerId ? m.player2_name : m.player1_name,
            opponentId: m.player1_id === playerId ? m.player2_id : m.player1_id,
            isHome: m.player1_id === playerId,
            result: m.status !== 'completed' ? null :
                    m.is_draw ? 'D' :
                    m.winner_id === playerId ? 'W' : 'L'
        }));
    }

    /**
     * Get pending matches
     */
    function getPendingMatches(league) {
        return league.matches.filter(m => m.status === 'pending');
    }

    /**
     * Get in-progress matches
     */
    function getInProgressMatches(league) {
        return league.matches.filter(m => m.status === 'in_progress');
    }

    /**
     * Get completed matches
     */
    function getCompletedMatches(league) {
        return league.matches.filter(m => m.status === 'completed');
    }

    /**
     * Get match by ID
     */
    function getMatch(league, matchId) {
        return league.matches.find(m => m.id === matchId);
    }

    /**
     * Get league progress
     */
    function getProgress(league) {
        const total = league.matches.length;
        const completed = league.matches.filter(m => m.status === 'completed').length;
        const inProgress = league.matches.filter(m => m.status === 'in_progress').length;
        const pending = league.matches.filter(m => m.status === 'pending').length;

        return {
            total,
            completed,
            inProgress,
            pending,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }

    // Public API
    return {
        create,
        addParticipant,
        removeParticipant,
        generateFixtures,
        startMatch,
        recordMatchResult,
        getStandings,
        getHeadToHead,
        getFixturesByRound,
        getPlayerFixtures,
        getPendingMatches,
        getInProgressMatches,
        getCompletedMatches,
        getMatch,
        getProgress,
        checkLeagueComplete
    };
})();
