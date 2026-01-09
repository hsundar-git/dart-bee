/**
 * Main App Module
 * Handles routing, event listeners, and app state
 */

const App = (() => {
    let currentGame = null;
    let isSpectatorMode = false;
    let isOperationInProgress = false;
    let spectatorSubscription = null;
    let homeSubscription = null;

    /**
     * Check if an operation is in progress
     */
    function isOperationPending() {
        return isOperationInProgress;
    }

    /**
     * Mark operation as started
     */
    function startOperation() {
        isOperationInProgress = true;
    }

    /**
     * Mark operation as complete
     */
    function endOperation() {
        isOperationInProgress = false;
    }

    // Competition state
    let currentTournament = null;
    let currentLeague = null;

    /**
     * Initialize the app and setup all event listeners
     */
    function init() {
        setupNavigation();
        setupHomeEvents();
        setupNewGameEvents();
        setupGameEvents();
        setupHistoryEvents();
        setupLeaderboardEvents();
        setupStatsEvents();
        setupModalEvents();
        setupCompetitionEvents();
    }

    /**
     * Handle route changes from router
     */
    async function handleRoute(routeInfo) {
        console.log('Handling route:', routeInfo);

        // Clean up subscriptions when navigating away
        if (isSpectatorMode && routeInfo.route !== 'game') {
            unsubscribeFromGameUpdates();
            isSpectatorMode = false;
        }
        if (routeInfo.route !== 'home') {
            unsubscribeFromHomeUpdates();
        }

        try {
            switch (routeInfo.route) {
                case 'home':
                    loadHome();
                    break;

                case 'game':
                    await loadGameFromUrl(routeInfo.gameId);
                    break;

                case 'new-game':
                    loadNewGame();
                    break;

                case 'history':
                    await loadHistory();
                    break;

                case 'game-detail':
                    await App.viewGameDetail(routeInfo.gameId);
                    break;

                case 'leaderboard':
                    await loadLeaderboard(routeInfo.metric, routeInfo.filter);
                    break;

                case 'player-profile':
                    await App.viewPlayerProfile(routeInfo.playerName);
                    break;

                // Competition routes
                case 'competitions':
                    await loadCompetitions();
                    break;

                case 'new-tournament':
                    loadNewTournament();
                    break;

                case 'tournament':
                    await loadTournament(routeInfo.tournamentId);
                    break;

                case 'new-league':
                    loadNewLeague();
                    break;

                case 'league':
                    await loadLeague(routeInfo.leagueId);
                    break;

                case 'stats':
                    await loadStats();
                    break;

                default:
                    loadHome();
            }
        } catch (error) {
            console.error('Route handling error:', error);
            loadHome();
        }
    }

    /**
     * Load game from URL - determine if active or spectator
     */
    async function loadGameFromUrl(gameId) {
        UI.showLoader('Loading game...');
        try {
            const game = await Storage.getGame(gameId);
            if (!game) {
                UI.showToast('Game not found', 'error');
                loadHome();
                UI.hideLoader();
                return;
            }

            currentGame = game;
            isSpectatorMode = !Device.isGameOwner(game.device_id);

            if (isSpectatorMode) {
                console.log('Opening game in SPECTATOR mode');
                UI.showToast('📺 Viewing as Spectator', 'info');
                loadSpectatorGame();
            } else {
                console.log('Opening game in ACTIVE mode');
                UI.showToast('🎮 Game Resumed', 'info');
                loadActiveGame();
            }
            UI.hideLoader();
        } catch (error) {
            console.error('Error loading game:', error);
            UI.showToast('Failed to load game', 'error');
            loadHome();
            UI.hideLoader();
        }
    }

    /**
     * Check if running in spectator mode
     */
    function getIsSpectatorMode() {
        return isSpectatorMode;
    }

    /**
     * Setup navigation listeners
     */
    function setupNavigation() {
        // Handle navbar brand click to go home
        const navbarBrand = document.querySelector('.navbar-brand');
        if (navbarBrand) {
            navbarBrand.style.cursor = 'pointer';
            navbarBrand.addEventListener('click', () => {
                Router.navigate('home');
            });
        }

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                switch (page) {
                    case 'home':
                        Router.navigate('home');
                        break;
                    case 'new-game':
                        Router.navigate('new-game');
                        break;
                    case 'history':
                        Router.navigate('history');
                        break;
                    case 'leaderboard':
                        Router.navigate('leaderboard');
                        break;
                    case 'competitions':
                        Router.navigate('competitions');
                        break;
                    case 'stats':
                        Router.navigate('stats');
                        break;
                }
            });
        });
    }

    /**
     * Setup home page events
     */
    function setupHomeEvents() {
        document.getElementById('quick-new-game')?.addEventListener('click', () => {
            Router.navigate('new-game');
        });
    }

    /**
     * Setup new game form events
     */
    function setupNewGameEvents() {
        const form = document.getElementById('new-game-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const playerCount = parseInt(document.getElementById('player-count').value);
                const playerNames = Array.from(document.querySelectorAll('#player-names-container input'))
                    .map(input => input.value);

                let gameType = document.getElementById('game-type').value;
                if (gameType === 'custom') {
                    gameType = document.getElementById('custom-points').value;
                }

                const winBelow = document.getElementById('win-below').checked;
                const scoringMode = document.querySelector('input[name="scoringMode"]:checked').value;

                currentGame = Game.createGame({
                    playerCount,
                    playerNames,
                    gameType,
                    winBelow,
                    scoringMode
                });

                try {
                    await Storage.saveGame(currentGame);
                    // Navigate to game URL instead of loading directly
                    Router.navigate('game', { gameId: currentGame.id });
                } catch (error) {
                    UI.showToast('Failed to save game', 'error');
                    console.error('Save game error:', error);
                }
            });
        }
    }

    /**
     * Setup active game events
     */
    function setupGameEvents() {
        document.getElementById('submit-turn-btn')?.addEventListener('click', submitTurn);
        document.getElementById('undo-dart-btn')?.addEventListener('click', undoTurn);
        document.getElementById('end-game-btn')?.addEventListener('click', endGame);
        document.getElementById('share-game-btn')?.addEventListener('click', shareGame);
        document.getElementById('rematch-btn')?.addEventListener('click', startRematch);
        document.getElementById('home-btn')?.addEventListener('click', () => {
            Router.navigate('home');
        });
    }

    /**
     * Setup history page events
     */
    function setupHistoryEvents() {
        const playerFilter = document.getElementById('history-player-filter');
        const sortSelect = document.getElementById('history-sort');

        if (playerFilter) {
            playerFilter.addEventListener('input', async (e) => {
                await UI.renderGameHistory(e.target.value, sortSelect.value, 1);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', async (e) => {
                await UI.renderGameHistory(playerFilter?.value || '', e.target.value, 1);
            });
        }

        // Pagination button events
        const paginationPrev = document.getElementById('pagination-prev');
        const paginationNext = document.getElementById('pagination-next');

        if (paginationPrev) {
            paginationPrev.addEventListener('click', async (e) => {
                e.preventDefault();
                const currentPage = UI.getPaginationState().currentPage;
                await UI.renderGameHistory(
                    UI.getPaginationState().filter,
                    UI.getPaginationState().sortOrder,
                    currentPage - 1
                );
            });
        }

        if (paginationNext) {
            paginationNext.addEventListener('click', async (e) => {
                e.preventDefault();
                const currentPage = UI.getPaginationState().currentPage;
                await UI.renderGameHistory(
                    UI.getPaginationState().filter,
                    UI.getPaginationState().sortOrder,
                    currentPage + 1
                );
            });
        }

        const backBtn = document.getElementById('back-to-history');
        if (backBtn) {
            backBtn.addEventListener('click', loadHistory);
        }
    }

    /**
     * Setup leaderboard events
     */
    function setupLeaderboardEvents() {
        // Time filters - navigate to update URL
        document.querySelectorAll('.time-filters .filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                const metric = document.querySelector('.leaderboard-tabs .tab-btn.active').dataset.tab;
                Router.navigate('leaderboard', { metric, filter });
            });
        });

        // Metric tabs - navigate to update URL
        document.querySelectorAll('.leaderboard-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const metric = e.target.dataset.tab;
                const filter = document.querySelector('.time-filters .filter-btn.active').dataset.filter;
                Router.navigate('leaderboard', { metric, filter });
            });
        });

        // Back to leaderboard from profile - preserve current tab state
        const backBtn = document.getElementById('back-to-leaderboard');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const metric = document.querySelector('.leaderboard-tabs .tab-btn.active')?.dataset.tab || 'wins';
                const filter = document.querySelector('.time-filters .filter-btn.active')?.dataset.filter || 'all-time';
                Router.navigate('leaderboard', { metric, filter });
            });
        }
    }

    /**
     * Setup modal events
     */
    function setupModalEvents() {
        document.getElementById('modal-close')?.addEventListener('click', UI.hideModal);
        document.getElementById('modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'modal') {
                UI.hideModal();
            }
        });
    }

    /**
     * Load home page
     */
    async function loadHome() {
        UI.showLoader('Loading dashboard...');
        try {
            UI.showPage('home-page');
            await UI.renderRecentGames();
            // Subscribe to live updates for active games
            subscribeToHomeUpdates();
        } catch (error) {
            console.error('Error loading home:', error);
            UI.showToast('Failed to load dashboard', 'error');
        } finally {
            UI.hideLoader();
        }
    }

    /**
     * Subscribe to real-time updates for home page (active games)
     */
    function subscribeToHomeUpdates() {
        unsubscribeFromHomeUpdates();

        const supabase = Storage.sb;
        if (!supabase) return;

        homeSubscription = supabase
            .channel('home-games')
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'games'
                },
                async () => {
                    console.log('Games table updated, refreshing home...');
                    await UI.renderRecentGames();
                }
            )
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'game_players'
                },
                async () => {
                    console.log('Game players updated, refreshing home...');
                    await UI.renderRecentGames();
                }
            )
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'turns'
                },
                async () => {
                    console.log('New turn added, refreshing home...');
                    await UI.renderRecentGames();
                }
            )
            .subscribe((status) => {
                console.log('Home subscription status:', status);
            });
    }

    /**
     * Unsubscribe from home updates
     */
    function unsubscribeFromHomeUpdates() {
        if (homeSubscription) {
            Storage.sb?.removeChannel(homeSubscription);
            homeSubscription = null;
        }
    }

    /**
     * Load new game page
     */
    function loadNewGame() {
        UI.showPage('new-game-page');
        UI.renderNewGameForm();
    }

    /**
     * Load active game page
     */
    function loadActiveGame() {
        if (!currentGame) return;
        UI.showPage('active-game-page');
        UI.updateActiveGameUI(currentGame);
    }

    /**
     * Load game in spectator mode (read-only) with live updates
     */
    async function loadSpectatorGame() {
        if (!currentGame) return;
        UI.showPage('active-game-page');
        UI.renderSpectatorGame(currentGame);

        // Subscribe to real-time updates
        await subscribeToGameUpdates(currentGame.id);
    }

    /**
     * Subscribe to real-time game updates for spectator mode
     */
    async function subscribeToGameUpdates(gameId) {
        // Clean up any existing subscription
        unsubscribeFromGameUpdates();

        const supabase = Storage.sb;
        if (!supabase) {
            console.warn('Supabase not available for real-time updates');
            return;
        }

        spectatorSubscription = supabase
            .channel(`spectator:${gameId}`)
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'games',
                    filter: `id=eq.${gameId}`
                },
                async (payload) => {
                    console.log('Game updated (spectator):', payload);
                    // Reload the full game to get player data
                    const updatedGame = await Storage.getGame(gameId);
                    if (updatedGame) {
                        currentGame = updatedGame;
                        UI.renderSpectatorGame(currentGame);
                    }
                }
            )
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'game_players',
                    filter: `game_id=eq.${gameId}`
                },
                async () => {
                    // Player stats updated, reload game
                    const updatedGame = await Storage.getGame(gameId);
                    if (updatedGame) {
                        currentGame = updatedGame;
                        UI.renderSpectatorGame(currentGame);
                    }
                }
            )
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'turns'
                },
                async () => {
                    // New turn added, reload game
                    const updatedGame = await Storage.getGame(gameId);
                    if (updatedGame) {
                        currentGame = updatedGame;
                        UI.renderSpectatorGame(currentGame);
                    }
                }
            )
            .subscribe((status) => {
                console.log('Spectator subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    UI.showLiveIndicator(true);
                } else if (status === 'CHANNEL_ERROR') {
                    UI.showLiveIndicator(false);
                }
            });
    }

    /**
     * Unsubscribe from game updates
     */
    function unsubscribeFromGameUpdates() {
        if (spectatorSubscription) {
            Storage.sb?.removeChannel(spectatorSubscription);
            spectatorSubscription = null;
            UI.showLiveIndicator(false);
        }
    }

    /**
     * Load history page
     */
    async function loadHistory() {
        const gameDetailPage = document.getElementById('game-detail-page');
        gameDetailPage.classList.add('hidden');
        document.getElementById('history-page').classList.remove('hidden');
        UI.showPage('history-page');
        await UI.renderGameHistory();
    }

    /**
     * Load leaderboard page
     */
    async function loadLeaderboard(metric = 'wins', filter = 'all-time') {
        const profilePage = document.getElementById('player-profile-page');
        profilePage.classList.add('hidden');
        document.getElementById('leaderboard-page').classList.remove('hidden');
        UI.showPage('leaderboard-page');

        // Update active states for tabs based on URL params
        document.querySelectorAll('.leaderboard-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === metric);
        });
        document.querySelectorAll('.time-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        await UI.renderLeaderboard(metric, filter);
    }

    /**
     * Load stats page
     */
    async function loadStats() {
        UI.showPage('stats-page');
        await UI.renderStatsPage();
    }

    /**
     * Setup stats page events
     */
    function setupStatsEvents() {
        // Player selector change
        const playerSelect = document.getElementById('stats-player-select');
        if (playerSelect) {
            playerSelect.addEventListener('change', async (e) => {
                const playerName = e.target.value;
                await UI.renderPlayerStatsWidgets(playerName);
            });
        }

        // Compare players button
        const compareBtn = document.getElementById('compare-players-btn');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => {
                UI.openComparisonModal();
            });
        }

        // Run comparison button
        const runCompareBtn = document.getElementById('run-comparison-btn');
        if (runCompareBtn) {
            runCompareBtn.addEventListener('click', () => {
                UI.runPlayerComparison();
            });
        }

        // Listen for preferences changes
        document.addEventListener('statsPreferencesChanged', async (e) => {
            const playerSelect = document.getElementById('stats-player-select');
            if (playerSelect && playerSelect.value) {
                await UI.renderPlayerStatsWidgets(playerSelect.value);
            }
        });
    }

    /**
     * Submit current turn
     */
    async function submitTurn() {
        if (!currentGame || isOperationInProgress) return;

        // Prevent multiple submissions
        startOperation();
        UI.showLoader('Submitting turn...');

        try {
            const inputs = document.querySelectorAll('.dart-input');
            console.log('Found dart inputs:', inputs.length);

            const darts = Array.from(inputs)
                .map(input => input.value)
                .filter(v => v);

            console.log('Darts to submit:', darts);

            if (darts.length === 0) {
                UI.showToast('Please enter at least one dart', 'warning');
                endOperation();
                UI.hideLoader();
                return;
            }

            // Track previous turn before submitting
            const previousTurn = currentGame.current_turn;

            const result = Game.submitTurn(currentGame, darts);
            console.log('Turn submission result:', result);

            if (!result.success) {
                UI.showToast(result.error, 'error');
                endOperation();
                UI.hideLoader();
                return;
            }

            console.log('Saving game to database...');
            await Storage.updateGame(currentGame.id, currentGame);
            console.log('Game saved successfully');

            // Determine if round completed (current_turn increased)
            const roundCompleted = currentGame.current_turn > previousTurn;
            console.log(`Round completed: ${roundCompleted} (prev: ${previousTurn}, curr: ${currentGame.current_turn})`);

            // Player finished - update winners board
            if (result.playerFinished) {
                // Always animate when player finishes
                UI.updateWinnersBoard(result.allRankings, true);
                UI.showToast(`🏆 ${result.playerFinished} finished in ${['1st', '2nd', '3rd'][result.finishRank - 1] || result.finishRank + 'th'} place!`, 'success');

                // If game ended (last player finished)
                if (result.gameEnded) {
                    UI.updateWinnersBoard(result.finalRankings, true);
                    setTimeout(() => {
                        showGameCompletionModal(result.finalRankings);
                    }, 800);
                } else {
                    // Continue with next player
                    setTimeout(() => {
                        UI.updateActiveGameUI(currentGame, false); // Don't animate on next player setup
                        UI.showToast(`Next: ${result.nextPlayer}`, 'info');
                    }, 800);
                }
            } else {
                // Update rankings: animate only if round completed
                UI.updateWinnersBoard(result.allRankings || Game.getRankings(currentGame), roundCompleted);
                UI.updateActiveGameUI(currentGame, false); // Don't animate on regular update
                UI.showToast(`Next: ${result.nextPlayer}`, 'info');
            }
        } catch (error) {
            console.error('Error submitting turn:', error);
            UI.showToast('Failed to submit turn', 'error');
        } finally {
            endOperation();
            UI.hideLoader();
        }
    }

    /**
     * Undo last dart
     */
    async function undoTurn() {
        if (!currentGame) return;

        const result = Game.undoLastDart(currentGame);
        if (!result.success) {
            UI.showToast(result.error, 'warning');
            return;
        }

        await Storage.updateGame(currentGame.id, currentGame);
        UI.updateActiveGameUI(currentGame);
        UI.showToast(`Turn undone for ${result.player}`, 'info');
    }

    /**
     * End current game
     */
    async function endGame() {
        if (!currentGame) return;

        if (confirm('Are you sure you want to end this game?')) {
            Game.endGame(currentGame);
            await Storage.updateGame(currentGame.id, currentGame);
            currentGame = null;
            UI.showToast('Game ended', 'info');
            Router.navigate('home');
        }
    }

    /**
     * Show game completion modal with final rankings
     */
    function showGameCompletionModal(finalRankings) {
        const modal = document.getElementById('game-completion-modal');
        const rankingsDiv = document.getElementById('completion-rankings');

        console.log('showGameCompletionModal called');
        console.log('finalRankings:', finalRankings);
        console.log('finalRankings type:', typeof finalRankings);
        console.log('finalRankings is array:', Array.isArray(finalRankings));
        console.log('finalRankings length:', finalRankings ? finalRankings.length : 'N/A');
        console.log('modal element found:', !!modal);
        console.log('rankingsDiv element found:', !!rankingsDiv);

        if (!modal || !rankingsDiv) {
            console.error('Modal or rankings div not found!');
            return;
        }

        if (!finalRankings || !Array.isArray(finalRankings) || finalRankings.length === 0) {
            console.error('No valid rankings data available!', finalRankings);
            rankingsDiv.innerHTML = '<p>No rankings available</p>';
            UI.showModal(modal);
            return;
        }

        // Display final rankings
        let rankingsHtml = '<div class="final-rankings">';
        console.log('Rendering rankings:');
        finalRankings.forEach((player, index) => {
            console.log(`  Ranking ${index}:`, player);
            const medals = ['🥇', '🥈', '🥉'];
            const medal = medals[index] || '🏅';
            const position = index + 1;
            let suffix = 'th';
            if (position % 10 === 1 && position % 100 !== 11) suffix = 'st';
            else if (position % 10 === 2 && position % 100 !== 12) suffix = 'nd';
            else if (position % 10 === 3 && position % 100 !== 13) suffix = 'rd';

            rankingsHtml += `
                <div class="ranking-row">
                    <span class="rank-medal">${medal}</span>
                    <span class="rank-position">${position}${suffix}</span>
                    <span class="rank-name">${player.name}</span>
                    <span class="rank-stats">${player.turns} turns • ${parseFloat(player.avgPerTurn || player.avgPerDart).toFixed(1)} avg</span>
                </div>
            `;
        });
        rankingsHtml += '</div>';

        console.log('Rankings HTML:', rankingsHtml);
        rankingsDiv.innerHTML = rankingsHtml;
        console.log('Rankings HTML set in DOM');
        // Show the game completion modal directly (don't use UI.showModal which is for generic modal)
        modal.classList.remove('hidden');
    }

    /**
     * Start a rematch with the same players
     */
    async function startRematch() {
        if (!currentGame) return;

        // Extract player names from current game
        const playerNames = currentGame.players.map(p => p.name);
        const gameType = currentGame.game_type;
        const winCondition = currentGame.win_condition;
        const scoringMode = currentGame.scoring_mode;

        // Hide completion modal
        const modal = document.getElementById('game-completion-modal');
        modal.classList.add('hidden');

        // Create new game with same settings
        const newGame = Game.createGame({
            playerCount: playerNames.length,
            playerNames: playerNames,
            gameType: gameType,
            winBelow: winCondition === 'below',
            scoringMode: scoringMode
        });

        // Save to database
        await Storage.saveGame(newGame);

        // Load and display the new game
        currentGame = newGame;
        loadActiveGame(newGame.id);

        UI.showToast('Starting rematch...', 'info');
    }

    /**
     * Share current game
     */
    function shareGame() {
        if (!currentGame) return;

        // Generate spectator link using main app route
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
        const shareUrl = `${baseUrl}#game/${currentGame.id}`;

        // Copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            UI.showToast('Share link copied to clipboard! 📋', 'success');

            // Show modal with share link
            UI.showModal(`
                <div style="text-align: center;">
                    <h3 style="margin-bottom: 15px;">Share This Game</h3>
                    <p style="margin-bottom: 15px;">Send this link to friends to watch the game live:</p>
                    <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin: 15px 0; word-break: break-all;">
                        <code style="font-size: 12px;">${shareUrl}</code>
                    </div>
                    <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${shareUrl}'); alert('Copied!');" style="margin-top: 10px;">
                        📋 Copy Link
                    </button>
                </div>
            `, 'Share Game');
        }).catch(() => {
            UI.showToast('Failed to copy link', 'error');
        });
    }

    /**
     * View game detail
     */
    async function viewGameDetail(gameId) {
        document.getElementById('history-page').classList.add('hidden');
        document.getElementById('game-detail-page').classList.remove('hidden');
        UI.showPage('game-detail-page');
        await UI.renderGameDetail(gameId);
    }

    /**
     * View player profile
     */
    async function viewPlayerProfile(playerName) {
        document.getElementById('leaderboard-page').classList.add('hidden');
        document.getElementById('player-profile-page').classList.remove('hidden');
        UI.showPage('player-profile-page');
        await UI.renderPlayerProfile(playerName);
    }

    /**
     * Resume active game (if exists and was interrupted)
     * Only resume if:
     * - Game is marked as active
     * - Game has at least one turn (was actually played)
     * - Game has no completion date (wasn't finished)
     */
    async function resumeGame() {
        try {
            const games = await Storage.getGames();
            console.log('Total games in DB:', games.length);

            // Debug: log all games and their status
            games.forEach(g => {
                console.log(`Game ${g.id.substring(0, 8)}: is_active=${g.is_active}, completed_at=${g.completed_at}, players=${g.players.length}, turns=${g.players.reduce((sum, p) => sum + p.turns.length, 0)}`);
            });

            // Find an active game that was interrupted (not completed)
            // Also accept games that are active with at least 1 turn but no completion date
            const activeGame = games.find(g =>
                g.is_active &&
                !g.completed_at &&
                g.players.some(p => p.turns.length > 0)
            );

            if (activeGame) {
                console.log('Found active game to resume:', activeGame.id);
                currentGame = activeGame;
                loadActiveGame();
                UI.showToast('Game resumed', 'info');
                return true;
            }

            console.log('No active game found to resume');
            return false;
        } catch (error) {
            console.error('Resume game error:', error);
            return false;
        }
    }

    // ============================================================================
    // COMPETITION HANDLERS
    // ============================================================================

    /**
     * Setup competition page events
     */
    function setupCompetitionEvents() {
        // Competition tab switching
        document.querySelectorAll('.competition-tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.competition-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const tab = e.target.dataset.tab;
                await UI.renderCompetitionsHub(tab);
            });
        });
    }

    /**
     * Load competitions hub
     */
    async function loadCompetitions() {
        UI.showLoader('Loading competitions...');
        try {
            UI.showPage('competitions-page');
            await UI.renderCompetitionsHub('tournaments');
        } catch (error) {
            console.error('Error loading competitions:', error);
            UI.showToast('Failed to load competitions', 'error');
        } finally {
            UI.hideLoader();
        }
    }

    /**
     * Load new tournament page
     */
    function loadNewTournament() {
        UI.showPage('new-tournament-page');
        UI.renderNewTournamentForm();

        // Setup form submission
        const form = document.getElementById('new-tournament-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                await createTournament();
            };
        }
    }

    /**
     * Create new tournament
     */
    async function createTournament() {
        const name = document.getElementById('tournament-name').value;
        const format = document.getElementById('tournament-format').value;
        const maxPlayers = parseInt(document.getElementById('tournament-size').value);
        const gameType = parseInt(document.getElementById('tournament-game-type').value);

        const tournament = Tournament.create({
            name,
            format,
            maxPlayers,
            gameType,
            winCondition: 'exact',
            scoringMode: 'per-dart'
        });

        // Add players from form
        const playerInputs = document.querySelectorAll('#tournament-player-names .player-name-input');
        playerInputs.forEach(input => {
            if (input.value.trim()) {
                Tournament.addParticipant(tournament, input.value.trim());
            }
        });

        try {
            await Storage.saveTournament(tournament);
            currentTournament = tournament;
            UI.showToast('Tournament created!', 'success');
            Router.navigate('tournament', { tournamentId: tournament.id });
        } catch (error) {
            console.error('Error creating tournament:', error);
            UI.showToast('Failed to create tournament', 'error');
        }
    }

    /**
     * Load tournament detail
     */
    async function loadTournament(tournamentId) {
        UI.showLoader('Loading tournament...');
        try {
            const tournament = await Storage.getTournament(tournamentId);
            if (!tournament) {
                UI.showToast('Tournament not found', 'error');
                Router.navigate('competitions');
                return;
            }

            currentTournament = tournament;
            UI.showPage('tournament-page');
            await UI.renderTournamentDetail(tournament);
            setupTournamentDetailEvents();
        } catch (error) {
            console.error('Error loading tournament:', error);
            UI.showToast('Failed to load tournament', 'error');
        } finally {
            UI.hideLoader();
        }
    }

    /**
     * Setup tournament detail page events
     */
    function setupTournamentDetailEvents() {
        // Add participant button
        const addBtn = document.getElementById('add-participant-btn');
        if (addBtn) {
            addBtn.onclick = async () => {
                const nameInput = document.getElementById('new-participant-name');
                const name = nameInput?.value.trim();
                if (!name) {
                    UI.showToast('Enter a player name', 'warning');
                    return;
                }

                const result = Tournament.addParticipant(currentTournament, name);
                if (!result.success) {
                    UI.showToast(result.error, 'error');
                    return;
                }

                await Storage.saveTournamentParticipants(currentTournament.id, [result.participant]);
                nameInput.value = '';
                await UI.renderTournamentDetail(currentTournament);
                setupTournamentDetailEvents();
                UI.showToast(`${name} added!`, 'success');
            };
        }

        // Remove participant buttons
        document.querySelectorAll('.remove-participant-btn').forEach(btn => {
            btn.onclick = async () => {
                const name = btn.dataset.name;
                Tournament.removeParticipant(currentTournament, name);
                await UI.renderTournamentDetail(currentTournament);
                setupTournamentDetailEvents();
            };
        });

        // Shuffle button
        const shuffleBtn = document.getElementById('shuffle-participants-btn');
        if (shuffleBtn) {
            shuffleBtn.onclick = async () => {
                Tournament.shuffleParticipants(currentTournament);
                await UI.renderTournamentDetail(currentTournament);
                setupTournamentDetailEvents();
                UI.showToast('Shuffled!', 'info');
            };
        }

        // Start tournament button
        const startBtn = document.getElementById('start-tournament-btn');
        if (startBtn) {
            startBtn.onclick = async () => {
                const result = Tournament.generateBracket(currentTournament);
                if (!result.success) {
                    UI.showToast(result.error, 'error');
                    return;
                }

                try {
                    await Storage.saveTournamentParticipants(currentTournament.id, currentTournament.participants);
                    await Storage.saveTournamentMatches(currentTournament.id, currentTournament.matches);
                    await Storage.updateTournament(currentTournament.id, { status: 'in_progress' });

                    UI.showToast('Tournament started!', 'success');
                    await UI.renderTournamentDetail(currentTournament);
                    setupTournamentDetailEvents();
                } catch (error) {
                    console.error('Error starting tournament:', error);
                    UI.showToast('Failed to start tournament', 'error');
                }
            };
        }

        // Start match buttons
        document.querySelectorAll('.start-match-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const matchCard = btn.closest('.match-card');
                const matchId = matchCard?.dataset.matchId;
                if (!matchId) return;

                await startTournamentMatch(matchId);
            };
        });
    }

    /**
     * Start a tournament match
     */
    async function startTournamentMatch(matchId) {
        const result = Tournament.startMatch(currentTournament, matchId);
        if (!result.success) {
            UI.showToast(result.error, 'error');
            return;
        }

        // Add tournament context to game
        result.game.tournament_id = currentTournament.id;
        result.game.tournament_match_id = matchId;

        try {
            await Storage.saveGame(result.game);
            await Storage.updateTournamentMatch(matchId, {
                status: 'in_progress',
                game_id: result.game.id
            });

            currentGame = result.game;
            Router.navigate('game', { gameId: result.game.id });
        } catch (error) {
            console.error('Error starting match:', error);
            UI.showToast('Failed to start match', 'error');
        }
    }

    /**
     * Load new league page
     */
    function loadNewLeague() {
        UI.showPage('new-league-page');
        UI.renderNewLeagueForm();

        // Setup form submission
        const form = document.getElementById('new-league-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                await createLeague();
            };
        }
    }

    /**
     * Create new league
     */
    async function createLeague() {
        const name = document.getElementById('league-name').value;
        const gameType = parseInt(document.getElementById('league-game-type').value);
        const matchesPerPairing = parseInt(document.getElementById('league-matches-per-pairing')?.value || '1');

        const league = League.create({
            name,
            gameType,
            matchesPerPairing,
            winCondition: 'exact',
            scoringMode: 'per-dart'
        });

        // Add players from form
        const playerInputs = document.querySelectorAll('#league-player-names .player-name-input');
        playerInputs.forEach(input => {
            if (input.value.trim()) {
                League.addParticipant(league, input.value.trim());
            }
        });

        try {
            await Storage.saveLeague(league);
            currentLeague = league;
            UI.showToast('League created!', 'success');
            Router.navigate('league', { leagueId: league.id });
        } catch (error) {
            console.error('Error creating league:', error);
            UI.showToast('Failed to create league', 'error');
        }
    }

    /**
     * Load league detail
     */
    async function loadLeague(leagueId) {
        UI.showLoader('Loading league...');
        try {
            const league = await Storage.getLeague(leagueId);
            if (!league) {
                UI.showToast('League not found', 'error');
                Router.navigate('competitions');
                return;
            }

            currentLeague = league;
            UI.showPage('league-page');
            await UI.renderLeagueDetail(league);
            setupLeagueDetailEvents();
        } catch (error) {
            console.error('Error loading league:', error);
            UI.showToast('Failed to load league', 'error');
        } finally {
            UI.hideLoader();
        }
    }

    /**
     * Setup league detail page events
     */
    function setupLeagueDetailEvents() {
        // Add participant button
        const addBtn = document.getElementById('add-participant-btn');
        if (addBtn) {
            addBtn.onclick = async () => {
                const nameInput = document.getElementById('new-participant-name');
                const name = nameInput?.value.trim();
                if (!name) {
                    UI.showToast('Enter a player name', 'warning');
                    return;
                }

                const result = League.addParticipant(currentLeague, name);
                if (!result.success) {
                    UI.showToast(result.error, 'error');
                    return;
                }

                await Storage.saveLeagueParticipants(currentLeague.id, [result.participant]);
                nameInput.value = '';
                await UI.renderLeagueDetail(currentLeague);
                setupLeagueDetailEvents();
                UI.showToast(`${name} added!`, 'success');
            };
        }

        // Remove participant buttons
        document.querySelectorAll('.remove-participant-btn').forEach(btn => {
            btn.onclick = async () => {
                const name = btn.dataset.name;
                League.removeParticipant(currentLeague, name);
                await UI.renderLeagueDetail(currentLeague);
                setupLeagueDetailEvents();
            };
        });

        // Start league button
        const startBtn = document.getElementById('start-league-btn');
        if (startBtn) {
            startBtn.onclick = async () => {
                const result = League.generateFixtures(currentLeague);
                if (!result.success) {
                    UI.showToast(result.error, 'error');
                    return;
                }

                try {
                    await Storage.saveLeagueParticipants(currentLeague.id, currentLeague.participants);
                    await Storage.saveLeagueMatches(currentLeague.id, currentLeague.matches);
                    await Storage.updateLeague(currentLeague.id, { status: 'in_progress' });

                    UI.showToast('League started!', 'success');
                    await UI.renderLeagueDetail(currentLeague);
                    setupLeagueDetailEvents();
                } catch (error) {
                    console.error('Error starting league:', error);
                    UI.showToast('Failed to start league', 'error');
                }
            };
        }

        // Start match buttons
        document.querySelectorAll('.start-match-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const fixtureCard = btn.closest('.fixture-card');
                const matchId = fixtureCard?.dataset.matchId;
                if (!matchId) return;

                await startLeagueMatch(matchId);
            };
        });
    }

    /**
     * Start a league match
     */
    async function startLeagueMatch(matchId) {
        const result = League.startMatch(currentLeague, matchId);
        if (!result.success) {
            UI.showToast(result.error, 'error');
            return;
        }

        // Add league context to game
        result.game.league_id = currentLeague.id;
        result.game.league_match_id = matchId;

        try {
            await Storage.saveGame(result.game);
            await Storage.updateLeagueMatch(matchId, {
                status: 'in_progress',
                game_id: result.game.id
            });

            currentGame = result.game;
            Router.navigate('game', { gameId: result.game.id });
        } catch (error) {
            console.error('Error starting match:', error);
            UI.showToast('Failed to start match', 'error');
        }
    }

    /**
     * Handle game completion for competitions
     * Called when a competition game ends
     */
    async function handleCompetitionGameComplete(game, winner) {
        if (game.tournament_id && game.tournament_match_id) {
            // Tournament game
            const tournament = await Storage.getTournament(game.tournament_id);
            if (tournament) {
                const winnerParticipant = tournament.participants.find(p => p.name === winner.name);
                Tournament.recordMatchResult(tournament, game.tournament_match_id, winnerParticipant?.id, winner.name);

                // Update database
                await Storage.updateTournamentMatch(game.tournament_match_id, {
                    status: 'completed',
                    winner_name: winner.name
                });

                if (tournament.status === 'completed') {
                    await Storage.updateTournament(tournament.id, {
                        status: 'completed',
                        winner_name: tournament.winner_name
                    });
                }

                currentTournament = tournament;
            }
        } else if (game.league_id && game.league_match_id) {
            // League game
            const league = await Storage.getLeague(game.league_id);
            if (league) {
                const winnerParticipant = league.participants.find(p => p.name === winner.name);
                League.recordMatchResult(league, game.league_match_id, winnerParticipant?.id, winner.name);

                // Update database
                await Storage.updateLeagueMatch(game.league_match_id, {
                    status: 'completed',
                    winner_name: winner.name
                });

                // Update participant standings
                for (const p of league.participants) {
                    const dbParticipant = league.participants.find(lp => lp.name === p.name);
                    if (dbParticipant) {
                        await Storage.updateLeagueParticipant(dbParticipant.id, p);
                    }
                }

                if (league.status === 'completed') {
                    await Storage.updateLeague(league.id, {
                        status: 'completed',
                        winner_name: league.winner_name
                    });
                }

                currentLeague = league;
            }
        }
    }

    // Public API
    return {
        init,
        handleRoute,
        getIsSpectatorMode,
        loadHome,
        loadNewGame,
        loadActiveGame,
        loadSpectatorGame,
        loadHistory,
        loadLeaderboard,
        loadGameFromUrl,
        viewGameDetail,
        viewPlayerProfile,
        resumeGame,
        submitTurn,
        undoTurn,
        endGame,
        shareGame,
        // Competition functions
        loadCompetitions,
        loadTournament,
        loadLeague,
        loadNewTournament,
        loadNewLeague,
        handleCompetitionGameComplete
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 APP.JS VERSION 2.0 - NORMALIZED SCHEMA');

    // Ensure Storage is initialized before anything else
    try {
        console.log('Starting Storage initialization...');
        await Storage.init();

        // Wait for Storage.sb to be available (with timeout)
        let attempts = 0;
        while (!Storage.sb && attempts < 10) {
            console.log('Waiting for Storage.sb to be ready...', attempts);
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!Storage.sb) {
            throw new Error('Storage.sb not available after initialization');
        }

        console.log('Storage ready, initializing app...');
    } catch (error) {
        console.error('Failed to initialize Storage:', error);
        UI.showToast('Failed to connect to database. Please refresh the page.', 'error');
        return;
    }

    // Initialize app event listeners
    App.init();

    // Initialize router with route change handler
    Router.init(App.handleRoute);

    // Periodic auto-save for current game
    setInterval(async () => {
        if (window.currentGame) {
            try {
                await Storage.updateGame(window.currentGame.id, window.currentGame);
            } catch (error) {
                console.error('Auto-save failed:', error);
            }
        }
    }, 30000);
});

// Handle beforeunload
window.addEventListener('beforeunload', async (e) => {
    // Check if there's an active game that needs saving
    if (window.currentGame && window.currentGame.is_active) {
        e.preventDefault();
        e.returnValue = '';
    }
});
// v2.1 update
