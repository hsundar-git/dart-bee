/**
 * Fix Rankings Script
 * Recalculates winner/rankings for all completed games based on actual turn count
 *
 * Run this in the browser console while on the Dart Bee app
 */

async function fixAllGameRankings() {
    console.log('=== Starting Rankings Fix ===');

    const sb = Storage.sb;
    if (!sb) {
        console.error('Supabase not initialized. Make sure you are on the Dart Bee app.');
        return;
    }

    // Fetch all completed games with game_players and turns
    const { data: games, error } = await sb
        .from('games')
        .select(`
            id,
            game_type,
            winner_id,
            game_players(
                id,
                player_id,
                final_score,
                is_winner,
                finish_rank,
                total_turns,
                total_darts,
                total_score,
                player:players(id, name),
                turns(id)
            )
        `)
        .not('completed_at', 'is', null);

    if (error) {
        console.error('Error fetching games:', error);
        return;
    }

    console.log(`Found ${games.length} completed games to check`);

    let fixedCount = 0;

    for (const game of games) {
        const gamePlayers = game.game_players || [];

        // Get finished players (final_score = 0) with their turn counts
        const finishedPlayers = gamePlayers
            .filter(gp => gp.final_score === 0)
            .map(gp => ({
                id: gp.id,
                player_id: gp.player_id,
                name: gp.player?.name,
                turnCount: gp.turns?.length || gp.total_turns || 0,
                totalDarts: gp.total_darts || 0,
                totalScore: gp.total_score || 0,
                avgPerDart: gp.total_darts > 0 ? gp.total_score / gp.total_darts : 0,
                currentRank: gp.finish_rank,
                currentIsWinner: gp.is_winner
            }));

        // Get unfinished players
        const unfinishedPlayers = gamePlayers
            .filter(gp => gp.final_score !== 0)
            .map(gp => ({
                id: gp.id,
                player_id: gp.player_id,
                name: gp.player?.name,
                finalScore: gp.final_score,
                turnCount: gp.turns?.length || gp.total_turns || 0,
                avgPerDart: gp.total_darts > 0 ? gp.total_score / gp.total_darts : 0,
                currentRank: gp.finish_rank
            }));

        // Sort finished players by turns (fewer = better), then by avg (higher = better)
        finishedPlayers.sort((a, b) => {
            if (a.turnCount !== b.turnCount) {
                return a.turnCount - b.turnCount;
            }
            return b.avgPerDart - a.avgPerDart;
        });

        // Sort unfinished players by score (lower = better), then by avg (higher = better)
        unfinishedPlayers.sort((a, b) => {
            if (a.finalScore !== b.finalScore) {
                return a.finalScore - b.finalScore;
            }
            return b.avgPerDart - a.avgPerDart;
        });

        // Assign new ranks
        let rank = 1;
        const updates = [];

        for (const fp of finishedPlayers) {
            const newRank = rank++;
            const isWinner = newRank === 1;

            if (fp.currentRank !== newRank || fp.currentIsWinner !== isWinner) {
                updates.push({
                    gamePlayerId: fp.id,
                    playerId: fp.player_id,
                    name: fp.name,
                    oldRank: fp.currentRank,
                    newRank: newRank,
                    isWinner: isWinner,
                    turnCount: fp.turnCount
                });
            }
        }

        for (const up of unfinishedPlayers) {
            const newRank = rank++;
            if (up.currentRank !== newRank) {
                updates.push({
                    gamePlayerId: up.id,
                    playerId: up.player_id,
                    name: up.name,
                    oldRank: up.currentRank,
                    newRank: newRank,
                    isWinner: false,
                    turnCount: up.turnCount
                });
            }
        }

        if (updates.length > 0) {
            console.log(`\nGame ${game.id}:`);

            // Find the correct winner
            const correctWinner = updates.find(u => u.isWinner);

            for (const update of updates) {
                console.log(`  ${update.name}: rank ${update.oldRank} -> ${update.newRank} (${update.turnCount} turns)${update.isWinner ? ' [WINNER]' : ''}`);

                // Update game_players
                const { error: updateError } = await sb
                    .from('game_players')
                    .update({
                        finish_rank: update.newRank,
                        is_winner: update.isWinner
                    })
                    .eq('id', update.gamePlayerId);

                if (updateError) {
                    console.error(`  Error updating ${update.name}:`, updateError);
                }
            }

            // Update games.winner_id if winner changed
            if (correctWinner && game.winner_id !== correctWinner.playerId) {
                console.log(`  Updating game winner_id to ${correctWinner.name} (${correctWinner.playerId})`);

                const { error: gameError } = await sb
                    .from('games')
                    .update({ winner_id: correctWinner.playerId })
                    .eq('id', game.id);

                if (gameError) {
                    console.error(`  Error updating game winner:`, gameError);
                }
            }

            fixedCount++;
        }
    }

    console.log(`\n=== Done! Fixed ${fixedCount} games ===`);
}

// Also export a function to fix a single game by ID
async function fixGameRanking(gameId) {
    console.log(`=== Fixing game ${gameId} ===`);

    const sb = Storage.sb;
    if (!sb) {
        console.error('Supabase not initialized');
        return;
    }

    const { data: game, error } = await sb
        .from('games')
        .select(`
            id,
            winner_id,
            game_players(
                id,
                player_id,
                final_score,
                is_winner,
                finish_rank,
                total_turns,
                total_darts,
                total_score,
                player:players(id, name),
                turns(id)
            )
        `)
        .eq('id', gameId)
        .single();

    if (error) {
        console.error('Error fetching game:', error);
        return;
    }

    const gamePlayers = game.game_players || [];

    // Get finished players with turn counts
    const finishedPlayers = gamePlayers
        .filter(gp => gp.final_score === 0)
        .map(gp => ({
            id: gp.id,
            player_id: gp.player_id,
            name: gp.player?.name,
            turnCount: gp.turns?.length || gp.total_turns || 0,
            totalDarts: gp.total_darts || 0,
            totalScore: gp.total_score || 0,
            avgPerDart: gp.total_darts > 0 ? gp.total_score / gp.total_darts : 0
        }));

    const unfinishedPlayers = gamePlayers
        .filter(gp => gp.final_score !== 0)
        .map(gp => ({
            id: gp.id,
            player_id: gp.player_id,
            name: gp.player?.name,
            finalScore: gp.final_score,
            turnCount: gp.turns?.length || gp.total_turns || 0,
            avgPerDart: gp.total_darts > 0 ? gp.total_score / gp.total_darts : 0
        }));

    // Sort by turns (fewer = better), then avg (higher = better)
    finishedPlayers.sort((a, b) => {
        if (a.turnCount !== b.turnCount) return a.turnCount - b.turnCount;
        return b.avgPerDart - a.avgPerDart;
    });

    unfinishedPlayers.sort((a, b) => {
        if (a.finalScore !== b.finalScore) return a.finalScore - b.finalScore;
        return b.avgPerDart - a.avgPerDart;
    });

    // Assign ranks
    let rank = 1;
    let winnerId = null;

    console.log('\nNew rankings:');
    for (const fp of finishedPlayers) {
        const isWinner = rank === 1;
        if (isWinner) winnerId = fp.player_id;

        console.log(`  ${rank}. ${fp.name} - ${fp.turnCount} turns, avg ${fp.avgPerDart.toFixed(2)}${isWinner ? ' [WINNER]' : ''}`);

        await sb.from('game_players').update({
            finish_rank: rank,
            is_winner: isWinner
        }).eq('id', fp.id);

        rank++;
    }

    for (const up of unfinishedPlayers) {
        console.log(`  ${rank}. ${up.name} - ${up.turnCount} turns, score ${up.finalScore} (DNF)`);

        await sb.from('game_players').update({
            finish_rank: rank,
            is_winner: false
        }).eq('id', up.id);

        rank++;
    }

    // Update game winner
    if (winnerId) {
        await sb.from('games').update({ winner_id: winnerId }).eq('id', gameId);
        console.log(`\nGame winner updated to player_id: ${winnerId}`);
    }

    console.log('\n=== Done! ===');
}

console.log('Rankings fix script loaded!');
console.log('Run fixAllGameRankings() to fix all games');
console.log('Run fixGameRanking("game-id") to fix a specific game');
