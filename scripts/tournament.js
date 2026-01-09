/**
 * Tournament Module
 * Handles tournament creation, bracket generation, and match progression
 * Supports single and double elimination formats
 */

const Tournament = (() => {
    /**
     * Create a new tournament
     */
    function create(options) {
        const {
            name,
            format = 'single_elimination',
            maxPlayers = 8,
            gameType = 501,
            winCondition = 'exact',
            scoringMode = 'per-dart',
            playerNames = []
        } = options;

        const tournament = {
            id: Storage.generateUUID(),
            name: name || `Tournament ${new Date().toLocaleDateString()}`,
            created_at: new Date().toISOString(),
            status: 'registration',
            format: format,
            max_players: maxPlayers,
            game_type: gameType,
            win_condition: winCondition,
            scoring_mode: scoringMode,
            device_id: Device.getDeviceId(),
            participants: [],
            matches: []
        };

        return tournament;
    }

    /**
     * Add a participant to the tournament
     */
    function addParticipant(tournament, playerName) {
        if (tournament.status !== 'registration') {
            return { success: false, error: 'Tournament is not in registration phase' };
        }

        if (tournament.participants.length >= tournament.max_players) {
            return { success: false, error: 'Tournament is full' };
        }

        // Check for duplicate
        if (tournament.participants.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            return { success: false, error: 'Player already registered' };
        }

        const participant = {
            id: Storage.generateUUID(),
            name: playerName.trim(),
            bracket_position: tournament.participants.length + 1,
            eliminated: false,
            eliminated_in_round: null,
            final_placement: null
        };

        tournament.participants.push(participant);
        return { success: true, participant };
    }

    /**
     * Remove a participant from the tournament
     */
    function removeParticipant(tournament, playerName) {
        if (tournament.status !== 'registration') {
            return { success: false, error: 'Tournament is not in registration phase' };
        }

        const index = tournament.participants.findIndex(
            p => p.name.toLowerCase() === playerName.toLowerCase()
        );

        if (index === -1) {
            return { success: false, error: 'Player not found' };
        }

        tournament.participants.splice(index, 1);

        // Re-assign bracket positions
        tournament.participants.forEach((p, i) => {
            p.bracket_position = i + 1;
        });

        return { success: true };
    }

    /**
     * Shuffle participants randomly for bracket positions
     */
    function shuffleParticipants(tournament) {
        if (tournament.status !== 'registration') {
            return { success: false, error: 'Tournament is not in registration phase' };
        }

        // Fisher-Yates shuffle
        for (let i = tournament.participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tournament.participants[i], tournament.participants[j]] =
                [tournament.participants[j], tournament.participants[i]];
        }

        // Re-assign bracket positions
        tournament.participants.forEach((p, i) => {
            p.bracket_position = i + 1;
        });

        return { success: true };
    }

    /**
     * Generate the tournament bracket
     */
    function generateBracket(tournament) {
        if (tournament.status !== 'registration') {
            return { success: false, error: 'Tournament is not in registration phase' };
        }

        const playerCount = tournament.participants.length;
        if (playerCount < 2) {
            return { success: false, error: 'Need at least 2 players' };
        }

        // Shuffle participants for random matchups
        shuffleParticipants(tournament);

        // Calculate bracket structure
        const bracketSize = tournament.max_players;
        const totalRounds = Math.log2(bracketSize);

        // Clear existing matches
        tournament.matches = [];

        if (tournament.format === 'single_elimination') {
            generateSingleEliminationBracket(tournament, bracketSize, totalRounds);
        } else if (tournament.format === 'double_elimination') {
            generateDoubleEliminationBracket(tournament, bracketSize, totalRounds);
        }

        // Place participants in first round
        placeParticipantsInBracket(tournament);

        // Update match statuses
        updateMatchStatuses(tournament);

        tournament.status = 'in_progress';
        return { success: true, matches: tournament.matches };
    }

    /**
     * Generate single elimination bracket structure
     */
    function generateSingleEliminationBracket(tournament, bracketSize, totalRounds) {
        let matchIdCounter = 1;
        const matchesByRound = {};

        // Create matches for each round (starting from finals and working back)
        for (let round = totalRounds; round >= 1; round--) {
            const matchesInRound = Math.pow(2, totalRounds - round);
            matchesByRound[round] = [];

            for (let i = 1; i <= matchesInRound; i++) {
                const match = {
                    id: Storage.generateUUID(),
                    tournament_id: tournament.id,
                    round: round,
                    match_number: i,
                    player1_id: null,
                    player1_name: null,
                    player2_id: null,
                    player2_name: null,
                    winner_id: null,
                    winner_name: null,
                    status: 'pending',
                    winner_next_match_id: null,
                    loser_next_match_id: null,
                    game_id: null
                };

                matchesByRound[round].push(match);
                tournament.matches.push(match);
                matchIdCounter++;
            }
        }

        // Link matches (winner advances to next round)
        for (let round = 1; round < totalRounds; round++) {
            const currentRoundMatches = matchesByRound[round];
            const nextRoundMatches = matchesByRound[round + 1];

            currentRoundMatches.forEach((match, index) => {
                const nextMatchIndex = Math.floor(index / 2);
                if (nextRoundMatches[nextMatchIndex]) {
                    match.winner_next_match_id = nextRoundMatches[nextMatchIndex].id;
                }
            });
        }
    }

    /**
     * Generate double elimination bracket structure
     */
    function generateDoubleEliminationBracket(tournament, bracketSize, totalRounds) {
        const matchesByRound = { winners: {}, losers: {} };

        // Create winners bracket
        for (let round = 1; round <= totalRounds; round++) {
            const matchesInRound = Math.pow(2, totalRounds - round);
            matchesByRound.winners[round] = [];

            for (let i = 1; i <= matchesInRound; i++) {
                const match = {
                    id: Storage.generateUUID(),
                    tournament_id: tournament.id,
                    round: round, // Positive = winners bracket
                    match_number: i,
                    player1_id: null,
                    player1_name: null,
                    player2_id: null,
                    player2_name: null,
                    winner_id: null,
                    winner_name: null,
                    status: 'pending',
                    winner_next_match_id: null,
                    loser_next_match_id: null,
                    game_id: null,
                    bracket: 'winners'
                };

                matchesByRound.winners[round].push(match);
                tournament.matches.push(match);
            }
        }

        // Create losers bracket (more complex structure)
        // Losers bracket has 2 * (totalRounds - 1) rounds
        const losersRounds = 2 * (totalRounds - 1);
        let losersMatchCount = bracketSize / 2;

        for (let round = 1; round <= losersRounds; round++) {
            matchesByRound.losers[round] = [];

            // Losers bracket shrinks every 2 rounds
            if (round % 2 === 0 && round > 1) {
                losersMatchCount = Math.max(1, losersMatchCount / 2);
            }

            const matchesInRound = Math.max(1, Math.floor(losersMatchCount));

            for (let i = 1; i <= matchesInRound; i++) {
                const match = {
                    id: Storage.generateUUID(),
                    tournament_id: tournament.id,
                    round: -round, // Negative = losers bracket
                    match_number: i,
                    player1_id: null,
                    player1_name: null,
                    player2_id: null,
                    player2_name: null,
                    winner_id: null,
                    winner_name: null,
                    status: 'pending',
                    winner_next_match_id: null,
                    loser_next_match_id: null,
                    game_id: null,
                    bracket: 'losers'
                };

                matchesByRound.losers[round].push(match);
                tournament.matches.push(match);
            }
        }

        // Create grand finals (winner of winners vs winner of losers)
        const grandFinals = {
            id: Storage.generateUUID(),
            tournament_id: tournament.id,
            round: totalRounds + 1, // Special round for grand finals
            match_number: 1,
            player1_id: null,
            player1_name: null,
            player2_id: null,
            player2_name: null,
            winner_id: null,
            winner_name: null,
            status: 'pending',
            winner_next_match_id: null,
            loser_next_match_id: null,
            game_id: null,
            bracket: 'grand_finals'
        };
        tournament.matches.push(grandFinals);

        // Link winners bracket matches
        for (let round = 1; round < totalRounds; round++) {
            const currentRoundMatches = matchesByRound.winners[round];
            const nextRoundMatches = matchesByRound.winners[round + 1];

            currentRoundMatches.forEach((match, index) => {
                const nextMatchIndex = Math.floor(index / 2);
                if (nextRoundMatches[nextMatchIndex]) {
                    match.winner_next_match_id = nextRoundMatches[nextMatchIndex].id;
                }

                // Link loser to losers bracket
                const losersRound = round === 1 ? 1 : (round - 1) * 2 + 1;
                if (matchesByRound.losers[losersRound]) {
                    const loserMatchIndex = Math.floor(index / 2) % matchesByRound.losers[losersRound].length;
                    match.loser_next_match_id = matchesByRound.losers[losersRound][loserMatchIndex]?.id;
                }
            });
        }

        // Link winners finals to grand finals
        const winnersFinals = matchesByRound.winners[totalRounds][0];
        if (winnersFinals) {
            winnersFinals.winner_next_match_id = grandFinals.id;
        }

        // Link losers bracket matches
        for (let round = 1; round < losersRounds; round++) {
            const currentRoundMatches = matchesByRound.losers[round];
            const nextRoundMatches = matchesByRound.losers[round + 1];

            if (currentRoundMatches && nextRoundMatches) {
                currentRoundMatches.forEach((match, index) => {
                    const nextMatchIndex = round % 2 === 0
                        ? Math.floor(index / 2)
                        : index % nextRoundMatches.length;
                    if (nextRoundMatches[nextMatchIndex]) {
                        match.winner_next_match_id = nextRoundMatches[nextMatchIndex].id;
                    }
                });
            }
        }

        // Link losers finals to grand finals
        const losersFinals = matchesByRound.losers[losersRounds]?.[0];
        if (losersFinals) {
            losersFinals.winner_next_match_id = grandFinals.id;
        }
    }

    /**
     * Place participants in first round matches
     */
    function placeParticipantsInBracket(tournament) {
        const firstRoundMatches = tournament.matches
            .filter(m => m.round === 1)
            .sort((a, b) => a.match_number - b.match_number);

        const participants = [...tournament.participants]
            .sort((a, b) => a.bracket_position - b.bracket_position);

        // Assign players to matches
        let participantIndex = 0;
        firstRoundMatches.forEach(match => {
            if (participantIndex < participants.length) {
                match.player1_id = participants[participantIndex].id;
                match.player1_name = participants[participantIndex].name;
                participantIndex++;
            }
            if (participantIndex < participants.length) {
                match.player2_id = participants[participantIndex].id;
                match.player2_name = participants[participantIndex].name;
                participantIndex++;
            }
        });

        // Handle byes (odd number of players or not full bracket)
        firstRoundMatches.forEach(match => {
            if (match.player1_name && !match.player2_name) {
                // Player 1 gets a bye - auto-advance
                match.winner_id = match.player1_id;
                match.winner_name = match.player1_name;
                match.status = 'completed';
                advanceWinner(tournament, match);
            } else if (!match.player1_name && match.player2_name) {
                // Player 2 gets a bye - auto-advance
                match.winner_id = match.player2_id;
                match.winner_name = match.player2_name;
                match.status = 'completed';
                advanceWinner(tournament, match);
            } else if (!match.player1_name && !match.player2_name) {
                // Empty match - mark as completed
                match.status = 'completed';
            }
        });
    }

    /**
     * Update match statuses based on player availability
     */
    function updateMatchStatuses(tournament) {
        tournament.matches.forEach(match => {
            if (match.status === 'completed') return;

            if (match.player1_name && match.player2_name) {
                match.status = 'ready';
            } else if (match.player1_name || match.player2_name) {
                match.status = 'pending'; // Waiting for other player
            } else {
                match.status = 'pending';
            }
        });
    }

    /**
     * Start a match (create the game)
     */
    function startMatch(tournament, matchId) {
        const match = tournament.matches.find(m => m.id === matchId);
        if (!match) {
            return { success: false, error: 'Match not found' };
        }

        if (match.status !== 'ready') {
            return { success: false, error: 'Match is not ready to start' };
        }

        if (!match.player1_name || !match.player2_name) {
            return { success: false, error: 'Both players must be set' };
        }

        // Create the game
        const game = Game.createGame({
            playerCount: 2,
            playerNames: [match.player1_name, match.player2_name],
            gameType: tournament.game_type,
            winBelow: tournament.win_condition === 'below',
            scoringMode: tournament.scoring_mode
        });

        // Add tournament context to game
        game.tournament_id = tournament.id;
        game.tournament_match_id = match.id;

        match.game_id = game.id;
        match.status = 'in_progress';

        return { success: true, game, match };
    }

    /**
     * Record match result
     */
    function recordMatchResult(tournament, matchId, winnerId, winnerName) {
        const match = tournament.matches.find(m => m.id === matchId);
        if (!match) {
            return { success: false, error: 'Match not found' };
        }

        match.winner_id = winnerId;
        match.winner_name = winnerName;
        match.status = 'completed';

        // Determine loser
        const loserId = match.player1_id === winnerId ? match.player2_id : match.player1_id;
        const loserName = match.player1_name === winnerName ? match.player2_name : match.player1_name;

        // Update participant elimination status
        const loser = tournament.participants.find(p => p.name === loserName);
        if (loser) {
            if (tournament.format === 'single_elimination') {
                loser.eliminated = true;
                loser.eliminated_in_round = match.round;
            } else if (tournament.format === 'double_elimination') {
                // In double elimination, check if already in losers bracket
                if (match.round < 0 || match.bracket === 'losers') {
                    // Lost in losers bracket = eliminated
                    loser.eliminated = true;
                    loser.eliminated_in_round = match.round;
                }
                // Lost in winners bracket = goes to losers bracket (handled by advanceLoser)
            }
        }

        // Advance winner to next match
        advanceWinner(tournament, match);

        // Handle loser (for double elimination)
        if (tournament.format === 'double_elimination' && match.round > 0) {
            advanceLoser(tournament, match, loserId, loserName);
        }

        // Check if tournament is complete
        checkTournamentComplete(tournament);

        return { success: true, match };
    }

    /**
     * Advance winner to next match
     */
    function advanceWinner(tournament, match) {
        if (!match.winner_next_match_id) return;

        const nextMatch = tournament.matches.find(m => m.id === match.winner_next_match_id);
        if (!nextMatch) return;

        // Place winner in next match
        if (!nextMatch.player1_id) {
            nextMatch.player1_id = match.winner_id;
            nextMatch.player1_name = match.winner_name;
        } else if (!nextMatch.player2_id) {
            nextMatch.player2_id = match.winner_id;
            nextMatch.player2_name = match.winner_name;
        }

        // Update match status
        updateMatchStatuses(tournament);
    }

    /**
     * Advance loser to losers bracket (double elimination only)
     */
    function advanceLoser(tournament, match, loserId, loserName) {
        if (!match.loser_next_match_id) return;

        const nextMatch = tournament.matches.find(m => m.id === match.loser_next_match_id);
        if (!nextMatch) return;

        // Place loser in losers bracket match
        if (!nextMatch.player1_id) {
            nextMatch.player1_id = loserId;
            nextMatch.player1_name = loserName;
        } else if (!nextMatch.player2_id) {
            nextMatch.player2_id = loserId;
            nextMatch.player2_name = loserName;
        }

        // Update match status
        updateMatchStatuses(tournament);
    }

    /**
     * Check if tournament is complete
     */
    function checkTournamentComplete(tournament) {
        // Find the final match
        let finalMatch;
        if (tournament.format === 'single_elimination') {
            const maxRound = Math.max(...tournament.matches.map(m => m.round));
            finalMatch = tournament.matches.find(m => m.round === maxRound);
        } else {
            // Double elimination - grand finals
            finalMatch = tournament.matches.find(m => m.bracket === 'grand_finals');
        }

        if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner_name) {
            tournament.status = 'completed';
            tournament.winner_id = finalMatch.winner_id;
            tournament.winner_name = finalMatch.winner_name;

            // Assign final placements
            assignFinalPlacements(tournament);

            return true;
        }

        return false;
    }

    /**
     * Assign final placements to all participants
     */
    function assignFinalPlacements(tournament) {
        // Winner gets 1st place
        const winner = tournament.participants.find(p => p.name === tournament.winner_name);
        if (winner) {
            winner.final_placement = 1;
        }

        // Sort others by elimination round (later round = better placement)
        const others = tournament.participants
            .filter(p => p.name !== tournament.winner_name)
            .sort((a, b) => {
                // Not eliminated yet (runner-up) = 2nd place
                if (!a.eliminated) return -1;
                if (!b.eliminated) return 1;
                // Higher round = better (eliminated later)
                return Math.abs(b.eliminated_in_round || 0) - Math.abs(a.eliminated_in_round || 0);
            });

        others.forEach((p, index) => {
            p.final_placement = index + 2; // Start from 2nd place
        });
    }

    /**
     * Get bracket structure for display
     */
    function getBracket(tournament) {
        const bracket = {
            winners: {},
            losers: {},
            grandFinals: null
        };

        tournament.matches.forEach(match => {
            if (match.bracket === 'grand_finals') {
                bracket.grandFinals = match;
            } else if (match.round > 0) {
                if (!bracket.winners[match.round]) {
                    bracket.winners[match.round] = [];
                }
                bracket.winners[match.round].push(match);
            } else {
                const losersRound = Math.abs(match.round);
                if (!bracket.losers[losersRound]) {
                    bracket.losers[losersRound] = [];
                }
                bracket.losers[losersRound].push(match);
            }
        });

        // Sort matches within each round
        Object.keys(bracket.winners).forEach(round => {
            bracket.winners[round].sort((a, b) => a.match_number - b.match_number);
        });
        Object.keys(bracket.losers).forEach(round => {
            bracket.losers[round].sort((a, b) => a.match_number - b.match_number);
        });

        return bracket;
    }

    /**
     * Get tournament standings
     */
    function getStandings(tournament) {
        return [...tournament.participants]
            .sort((a, b) => {
                // Sort by final placement (if assigned)
                if (a.final_placement && b.final_placement) {
                    return a.final_placement - b.final_placement;
                }
                if (a.final_placement) return -1;
                if (b.final_placement) return 1;

                // Active players first
                if (!a.eliminated && b.eliminated) return -1;
                if (a.eliminated && !b.eliminated) return 1;

                // Sort by elimination round (later = better)
                return Math.abs(b.eliminated_in_round || 0) - Math.abs(a.eliminated_in_round || 0);
            })
            .map((p, index) => ({
                rank: p.final_placement || (p.eliminated ? null : 'Active'),
                name: p.name,
                eliminated: p.eliminated,
                eliminatedInRound: p.eliminated_in_round
            }));
    }

    /**
     * Get round name for display
     */
    function getRoundName(round, totalRounds, format) {
        if (format === 'double_elimination') {
            if (round > totalRounds) return 'Grand Finals';
            if (round < 0) {
                return `Losers Round ${Math.abs(round)}`;
            }
        }

        const roundsFromEnd = totalRounds - round;
        switch (roundsFromEnd) {
            case 0: return 'Finals';
            case 1: return 'Semi-Finals';
            case 2: return 'Quarter-Finals';
            default: return `Round ${round}`;
        }
    }

    /**
     * Get match by ID
     */
    function getMatch(tournament, matchId) {
        return tournament.matches.find(m => m.id === matchId);
    }

    /**
     * Get ready matches (can be played now)
     */
    function getReadyMatches(tournament) {
        return tournament.matches.filter(m => m.status === 'ready');
    }

    /**
     * Get in-progress matches
     */
    function getInProgressMatches(tournament) {
        return tournament.matches.filter(m => m.status === 'in_progress');
    }

    // Public API
    return {
        create,
        addParticipant,
        removeParticipant,
        shuffleParticipants,
        generateBracket,
        startMatch,
        recordMatchResult,
        getBracket,
        getStandings,
        getRoundName,
        getMatch,
        getReadyMatches,
        getInProgressMatches,
        checkTournamentComplete
    };
})();
