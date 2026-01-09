/**
 * UI Module
 * Handles DOM manipulation and rendering
 */

const UI = (() => {
    /**
     * Show toast notification
     */
    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 200ms ease-in-out reverse';
            setTimeout(() => toast.remove(), 200);
        }, duration);
    }

    /**
     * Show loader overlay
     */
    function showLoader(text = 'Loading...') {
        const loader = document.getElementById('loader');
        const loaderText = loader.querySelector('.loader-text');
        loaderText.textContent = text;
        loader.classList.remove('hidden');
    }

    /**
     * Hide loader overlay
     */
    function hideLoader() {
        const loader = document.getElementById('loader');
        loader.classList.add('hidden');
    }

    /**
     * Show modal dialog
     */
    function showModal(content, title = '') {
        const modal = document.getElementById('modal');
        const body = document.getElementById('modal-body');
        body.innerHTML = '';

        if (title) {
            const titleEl = document.createElement('h2');
            titleEl.textContent = title;
            body.appendChild(titleEl);
        }

        if (typeof content === 'string') {
            body.innerHTML += content;
        } else {
            body.appendChild(content);
        }

        modal.classList.remove('hidden');
    }

    /**
     * Hide modal
     */
    function hideModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    /**
     * Show page
     */
    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');

        // Update nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageId.replace('-page', '')}"]`)?.classList.add('active');

        // Scroll to top
        window.scrollTo(0, 0);
    }

    /**
     * Render recent games on home page
     */
    async function renderStatsWidget() {
        try {
            const stats = await Stats.getQuickStats();

            document.getElementById('stat-games').textContent = stats.totalGames || '0';
            document.getElementById('stat-players').textContent = stats.totalPlayers || '0';
            document.getElementById('stat-top-player').textContent = stats.topPlayer || '—';
            document.getElementById('stat-avg').textContent = stats.highestAvg || '0';
        } catch (error) {
            console.error('Error rendering stats widget:', error);
            // Set default values on error
            document.getElementById('stat-games').textContent = '0';
            document.getElementById('stat-players').textContent = '0';
            document.getElementById('stat-top-player').textContent = '—';
            document.getElementById('stat-avg').textContent = '0';
        }
    }

    async function renderRecentGames() {
        try {
            const container = document.getElementById('recent-games-list');
            if (!container) {
                console.error('recent-games-list container not found');
                return;
            }

            // Also render stats widget
            await renderStatsWidget();

            // OPTIMIZED: Use pagination to load only what we need
            // Get interrupted games (active, not completed)
            const { games: interruptedGames } = await Storage.getGamesPaginated(1, 10, {
                completed: false
            });

            // Get 5 most recent completed games
            const { games: completedGames } = await Storage.getGamesPaginated(1, 5, {
                completed: true
            });

            if (interruptedGames.length === 0 && completedGames.length === 0) {
                container.innerHTML = '<p class="placeholder">No games yet. Start your first game!</p>';
                return;
            }

            let html = '';

            // Show interrupted games first with Resume button
            if (interruptedGames.length > 0) {
                html += '<div class="interrupted-games-section">';
                html += '<div class="section-title">⏸️ Interrupted Games</div>';

                interruptedGames.forEach(game => {
                    const currentPlayerIndex = game.current_player_index || 0;
                    const currentPlayer = game.players[currentPlayerIndex];
                    const date = new Date(game.created_at);
                    const dateStr = date.toLocaleDateString();
                    const totalTurns = game.players.reduce((sum, p) => sum + p.turns.length, 0);
                    const isOwner = Device.isGameOwner(game.device_id);

                    html += `
                        <div class="game-card interrupted-card">
                            <div class="game-card-header">
                                <div class="game-card-title">${game.game_type} Points</div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <div class="game-card-date">${dateStr}</div>
                                    <span class="game-status-badge" style="background: ${isOwner ? '#ff9800' : '#4caf50'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${isOwner ? 'IN PROGRESS' : 'LIVE'}</span>
                                </div>
                            </div>
                            <div class="game-card-players">
                                ${game.players.map(p => {
                                    const playerTurns = p.turns.length;
                                    return `
                                        <div class="player-badge ${p.name === currentPlayer?.name ? 'current' : ''}" style="display: flex; justify-content: space-between; align-items: center;">
                                            <span>${p.name}</span>
                                            <span style="font-weight: 700; color: ${p.currentScore <= 50 ? '#4caf50' : 'inherit'};">${p.currentScore}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            <div class="game-card-footer">
                                <span>Turn ${totalTurns} • Now: ${currentPlayer?.name || 'N/A'}</span>
                                <span class="game-type-badge">${game.players.length} players</span>
                            </div>
                            <button class="btn ${isOwner ? 'btn-primary' : 'btn-success'} btn-small" onclick="Router.navigate('game', {gameId: '${game.id}'})" style="width: 100%; margin-top: 8px;">
                                ${isOwner ? '▶️ Resume Game' : '📺 Watch Live'}
                            </button>
                        </div>
                    `;
                });

                html += '</div>';
            }

            // Show completed games
            if (completedGames.length > 0) {
                const needsWrapper = interruptedGames.length > 0;
                if (needsWrapper) {
                    html += '<div class="recent-games-section" style="margin-top: 16px;">';
                }

                html += '<div class="section-title">📜 Recent Games</div>';

                html += completedGames.map(game => {
                    const winner = game.players.find(p => p.winner);
                    const date = new Date(game.created_at);
                    const dateStr = date.toLocaleDateString();
                    const completedDate = game.completed_at ? new Date(game.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                    return `
                        <div class="game-card" onclick="Router.navigate('game-detail', {gameId: '${game.id}'})">
                            <div class="game-card-header">
                                <div class="game-card-title">${game.game_type} Points</div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <div class="game-card-date">${dateStr}</div>
                                    <span class="game-status-badge" style="background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">COMPLETED</span>
                                </div>
                            </div>
                            <div class="game-card-players">
                                ${game.players.map(p => `
                                    <div class="player-badge ${p.winner ? 'winner' : ''}">
                                        ${p.name}
                                    </div>
                                `).join('')}
                            </div>
                            <div class="game-card-footer">
                                <span>🏆 ${winner?.name || 'N/A'}</span>
                                <span class="game-type-badge">${game.players.length} players</span>
                            </div>
                        </div>
                    `;
                }).join('');

                if (needsWrapper) {
                    html += '</div>';
                }
            }

            container.innerHTML = html;
            console.log('Recent games rendered successfully');
        } catch (error) {
            console.error('Error rendering recent games:', error);
            const container = document.getElementById('recent-games-list');
            if (container) {
                container.innerHTML = '<p class="placeholder">Error loading games. Please refresh the page.</p>';
            }
        }
    }

    /**
     * Render quick stats on home page
     * OPTIMIZED: Uses Stats.getQuickStats() which queries database directly
     */
    async function renderQuickStats() {
        const stats = await Stats.getQuickStats();

        document.getElementById('stat-games').textContent = stats.totalGames || '0';
        document.getElementById('stat-players').textContent = stats.totalPlayers || '0';
        document.getElementById('stat-top-player').textContent = stats.topPlayer || '—';
        document.getElementById('stat-avg').textContent = stats.highestAvg || '0.00';
    }

    /**
     * Render new game form
     */
    async function renderNewGameForm() {
        const form = document.getElementById('new-game-form');
        const playerCountInput = document.getElementById('player-count');
        const gameTypeSelect = document.getElementById('game-type');
        const customPointsInput = document.getElementById('custom-points');
        const playerNamesContainer = document.getElementById('player-names-container');

        // Get all existing players for autocomplete
        let existingPlayers = [];
        try {
            const players = await Storage.getPlayers();
            existingPlayers = Object.keys(players) || [];
        } catch (error) {
            console.warn('Could not load players for autocomplete:', error);
        }

        // Handle player count changes
        document.getElementById('increase-players').onclick = (e) => {
            e.preventDefault();
            const current = parseInt(playerCountInput.value);
            if (current < 8) {
                playerCountInput.value = current + 1;
                updatePlayerNameInputs();
            }
        };

        document.getElementById('decrease-players').onclick = (e) => {
            e.preventDefault();
            const current = parseInt(playerCountInput.value);
            if (current > 1) {
                playerCountInput.value = current - 1;
                updatePlayerNameInputs();
            }
        };

        // Handle game type changes
        gameTypeSelect.addEventListener('change', () => {
            if (gameTypeSelect.value === 'custom') {
                customPointsInput.classList.remove('hidden');
                customPointsInput.focus();
            } else {
                customPointsInput.classList.add('hidden');
            }
        });

        function updatePlayerNameInputs() {
            const count = parseInt(playerCountInput.value);

            // Preserve existing values before rebuilding
            const existingValues = [];
            playerNamesContainer.querySelectorAll('.player-name-input').forEach(input => {
                existingValues.push(input.value);
            });

            playerNamesContainer.innerHTML = '';

            for (let i = 0; i < count; i++) {
                const wrapper = document.createElement('div');
                wrapper.style.position = 'relative';

                const input = document.createElement('input');
                input.type = 'text';
                input.name = `player-${i}`;
                input.placeholder = `Player ${i + 1} (optional)`;
                input.className = 'player-name-input';
                input.setAttribute('autocomplete', 'off');

                // Restore previous value if it exists
                if (i < existingValues.length) {
                    input.value = existingValues[i];
                }

                // Autocomplete suggestion list
                const suggestionsList = document.createElement('div');
                suggestionsList.className = 'player-suggestions';
                suggestionsList.style.display = 'none';

                // Handle input for suggestions
                input.addEventListener('input', (e) => {
                    const value = e.target.value.toLowerCase().trim();

                    // Validate for duplicates whenever input changes
                    validatePlayerNames();

                    if (value.length === 0) {
                        suggestionsList.style.display = 'none';
                        return;
                    }

                    // Get all currently selected player names (excluding this input)
                    const selectedNames = Array.from(playerNamesContainer.querySelectorAll('.player-name-input'))
                        .filter(inp => inp !== input)
                        .map(inp => inp.value.toLowerCase().trim())
                        .filter(name => name !== '');

                    // Filter existing players matching the input, excluding already selected ones
                    const matches = existingPlayers.filter(player =>
                        player.toLowerCase().includes(value) &&
                        !selectedNames.includes(player.toLowerCase())
                    );

                    if (matches.length === 0) {
                        suggestionsList.style.display = 'none';
                        return;
                    }

                    // Show suggestions
                    suggestionsList.innerHTML = matches.map(player => `
                        <div class="suggestion-item" data-player="${player}">
                            ${player}
                        </div>
                    `).join('');
                    suggestionsList.style.display = 'block';

                    // Handle suggestion clicks
                    suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('click', () => {
                            input.value = item.getAttribute('data-player');
                            suggestionsList.style.display = 'none';
                            validatePlayerNames();
                        });
                    });
                });

                // Hide suggestions when clicking outside
                input.addEventListener('blur', () => {
                    setTimeout(() => {
                        suggestionsList.style.display = 'none';
                    }, 200);
                    validatePlayerNames();
                });

                input.addEventListener('focus', () => {
                    if (input.value.length > 0) {
                        const event = new Event('input', { bubbles: true });
                        input.dispatchEvent(event);
                    }
                });

                wrapper.appendChild(input);
                wrapper.appendChild(suggestionsList);
                playerNamesContainer.appendChild(wrapper);
            }
        }

        // Validate player names for duplicates and enable/disable submit button
        function validatePlayerNames() {
            const submitButton = document.querySelector('#new-game-form button[type="submit"]');
            if (!submitButton) return;

            const playerInputs = Array.from(playerNamesContainer.querySelectorAll('.player-name-input'));
            const enteredNames = playerInputs
                .map(input => input.value.trim())
                .filter(name => name !== '');

            // Check for duplicates (case-insensitive)
            const normalizedNames = enteredNames.map(name => name.toLowerCase());
            const hasDuplicates = normalizedNames.length !== new Set(normalizedNames).size;

            // Clear previous error styling
            playerInputs.forEach(input => {
                input.style.borderColor = '';
            });

            if (hasDuplicates) {
                // Find and highlight duplicates
                const nameCounts = {};
                playerInputs.forEach(input => {
                    const name = input.value.trim().toLowerCase();
                    if (name !== '') {
                        nameCounts[name] = (nameCounts[name] || 0) + 1;
                    }
                });

                playerInputs.forEach(input => {
                    const name = input.value.trim().toLowerCase();
                    if (name !== '' && nameCounts[name] > 1) {
                        input.style.borderColor = '#f44336';
                    }
                });

                submitButton.disabled = true;
                submitButton.style.opacity = '0.5';
                submitButton.style.cursor = 'not-allowed';
                submitButton.title = 'Remove duplicate player names to continue';
            } else {
                submitButton.disabled = false;
                submitButton.style.opacity = '';
                submitButton.style.cursor = '';
                submitButton.title = '';
            }
        }

        updatePlayerNameInputs();
    }

    /**
     * Render scoreboard during active game
     */
    function renderScoreboard(game) {
        const container = document.getElementById('scoreboard');
        container.innerHTML = game.players.map((player, index) => {
            const isCurrent = index === game.current_player_index;
            const stats = player.stats;
            return `
                <div class="player-score-card ${isCurrent ? 'current' : ''}">
                    <div class="player-score-name">${player.name}</div>
                    <div class="player-score-value">${player.currentScore}</div>
                    <div class="player-score-stats">
                        <div>Turns: ${player.turns.length}</div>
                        <div>Darts: ${stats.totalDarts}</div>
                        <div>Avg: ${player.turns.length > 0 ? (stats.totalScore / player.turns.length).toFixed(1) : '—'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render dart input fields
     */
    function renderDartInputs(game) {
        const container = document.getElementById('dart-inputs-container');
        const player = Game.getCurrentPlayer(game);
        const mode = game.scoring_mode;

        container.innerHTML = '';

        if (mode === 'per-dart') {
            for (let i = 0; i < 3; i++) {
                const group = document.createElement('div');
                group.className = 'dart-input-group';
                group.innerHTML = `
                    <label>Dart ${i + 1}</label>
                    <input type="number" min="0" max="180" class="dart-input" placeholder="0">
                `;
                container.appendChild(group);
            }
        } else {
            const group = document.createElement('div');
            group.className = 'dart-input-group';
            group.innerHTML = `
                <label>Turn Total (3 darts)</label>
                <input type="number" min="0" max="180" class="dart-input" placeholder="0">
            `;
            container.appendChild(group);
        }

        // Add Enter key listener to all dart inputs
        container.querySelectorAll('.dart-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('submit-turn-btn').click();
                }
            });
        });

        // Add quick buttons
        const quickSection = document.createElement('div');
        quickSection.className = 'dart-number-pad';
        Game.getQuickDarts().forEach(dart => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dart-quick-btn';
            btn.textContent = dart;
            btn.onclick = (e) => {
                e.preventDefault();
                const inputs = container.querySelectorAll('.dart-input');
                const firstEmpty = Array.from(inputs).find(input => !input.value);
                if (firstEmpty) {
                    firstEmpty.value = dart;
                    firstEmpty.focus();
                }
            };
            quickSection.appendChild(btn);
        });
        container.appendChild(quickSection);
    }

    /**
     * Render current player info
     */
    function renderCurrentPlayer(game) {
        const player = Game.getCurrentPlayer(game);

        // Handle completed games or invalid player index
        if (!player) {
            const winner = game.players.find(p => p.winner);
            document.getElementById('current-player-name').textContent = winner
                ? `${winner.name} Wins!`
                : 'Game Complete';
            document.getElementById('game-title').textContent = `${game.game_type} - Finished`;
            return;
        }

        document.getElementById('current-player-name').textContent = `${player.name}'s Turn`;
        document.getElementById('game-title').textContent = `${game.game_type} - Turn ${game.current_turn + 1}`;
    }

    /**
     * Render turn history
     */
    function renderTurnHistory(game) {
        const container = document.getElementById('turn-history');
        container.innerHTML = '';

        game.players.forEach((player, playerIndex) => {
            if (player.turns.length === 0) return;

            player.turns.forEach((turn, turnIndex) => {
                const isCurrentPlayer = playerIndex === game.current_player_index;
                const turnsHTML = `
                    <div class="turn-item ${turn.busted ? 'busted' : ''}">
                        <div class="turn-item-header">
                            ${isCurrentPlayer ? '➜ ' : ''}${player.name} - Turn ${turnIndex + 1}
                        </div>
                        <div class="turn-item-details">
                            <div class="turn-darts">
                                ${turn.darts.map(d => `<span class="turn-dart">${d}</span>`).join('')}
                            </div>
                            <div class="turn-remaining">
                                Remaining: ${turn.remaining}
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML += turnsHTML;
            });
        });
    }

    /**
     * Pagination state
     */
    let paginationState = {
        currentPage: 1,
        gamesPerPage: 6,
        totalPages: 1,
        totalGames: 0,
        filter: '',
        sortOrder: 'newest'
    };

    /**
     * Render game history list with pagination
     * OPTIMIZED: Uses database-level pagination instead of client-side
     */
    async function renderGameHistory(filter = '', sortOrder = 'newest', page = 1) {
        const container = document.getElementById('games-history-list');

        // OPTIMIZED: Database-level pagination and filtering
        const { games: paginatedGames, pagination } = await Storage.getGamesPaginated(
            page,
            paginationState.gamesPerPage,
            {
                completed: true,
                playerName: filter || undefined,
                sortOrder: sortOrder
            }
        );

        // Update pagination state
        paginationState.filter = filter;
        paginationState.sortOrder = sortOrder;
        paginationState.currentPage = pagination.page;
        paginationState.totalPages = pagination.totalPages;
        paginationState.totalGames = pagination.total;

        // Show/hide pagination controls
        const paginationControls = document.getElementById('pagination-controls');
        if (pagination.total === 0) {
            container.innerHTML = '<p class="placeholder">No games found</p>';
            if (paginationControls) paginationControls.style.display = 'none';
            document.getElementById('history-games-count').textContent = 'Total: 0 games';
            return;
        }

        // Render games for current page
        container.innerHTML = paginatedGames.map(game => {
            const winner = game.players.find(p => p.winner);
            const date = new Date(game.created_at);
            const dateStr = date.toLocaleDateString();
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="game-card" onclick="Router.navigate('game-detail', {gameId: '${game.id}'})">
                    <div class="game-card-header">
                        <div class="game-card-title">${game.game_type} Points</div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div class="game-card-date">${dateStr} ${timeStr}</div>
                            <span class="game-status-badge" style="background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">COMPLETED</span>
                        </div>
                    </div>
                    <div class="game-card-players">
                        ${game.players.map(p => `
                            <div class="player-badge ${p.winner ? 'winner' : ''}">
                                ${p.name}
                            </div>
                        `).join('')}
                    </div>
                    <div class="game-card-footer">
                        <span>🏆 ${winner?.name || 'N/A'}</span>
                        <span class="game-type-badge">${game.players.length} players</span>
                    </div>
                </div>
            `;
        }).join('');

        // Update pagination controls
        updatePaginationControls();

        // Update games count
        document.getElementById('history-games-count').textContent = `Total: ${pagination.total} games`;
    }

    /**
     * Update pagination UI controls
     */
    function updatePaginationControls() {
        const { currentPage, totalPages, gamesPerPage, totalGames } = paginationState;
        const paginationControls = document.getElementById('pagination-controls');
        const paginationInfo = document.getElementById('pagination-info-text');
        const paginationPrev = document.getElementById('pagination-prev');
        const paginationNext = document.getElementById('pagination-next');
        const paginationNumbers = document.getElementById('pagination-numbers');

        if (!paginationControls) return;

        // Show/hide pagination
        if (totalPages <= 1) {
            paginationControls.style.display = 'none';
            return;
        }

        paginationControls.style.display = 'flex';

        // Update info text
        const startIdx = (currentPage - 1) * gamesPerPage + 1;
        const endIdx = Math.min(currentPage * gamesPerPage, totalGames || 0);
        paginationInfo.textContent = `Showing ${startIdx}-${endIdx} of ${totalGames || 0} (Page ${currentPage} of ${totalPages})`;

        // Update prev/next buttons
        paginationPrev.disabled = currentPage === 1;
        paginationNext.disabled = currentPage === totalPages;

        // Generate page number buttons
        paginationNumbers.innerHTML = '';
        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.className = `btn btn-secondary btn-small pagination-number ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = (e) => {
                e.preventDefault();
                renderGameHistory(paginationState.filter, paginationState.sortOrder, i);
            };
            paginationNumbers.appendChild(btn);
        }
    }

    /**
     * Render game detail view
     */
    async function renderGameDetail(gameId) {
        const game = await Storage.getGame(gameId);
        if (!game) return;

        const content = document.getElementById('game-detail-content');
        const winner = game.players.find(p => p.winner);
        const date = new Date(game.created_at);

        const createdTime = new Date(game.created_at).getTime();
        const completedTime = game.completed_at ? new Date(game.completed_at).getTime() : null;
        const duration = completedTime ? Game.formatDuration(completedTime - createdTime) : 'N/A';

        let html = `
            <div class="detail-header">
                <div class="detail-header-row">
                    <div class="detail-header-item">
                        <div class="detail-label">Game Type</div>
                        <div class="detail-value">${game.game_type} Points</div>
                    </div>
                    <div class="detail-header-item">
                        <div class="detail-label">Date</div>
                        <div class="detail-value">${date.toLocaleDateString()}</div>
                    </div>
                    <div class="detail-header-item">
                        <div class="detail-label">Winner</div>
                        <div class="detail-value">${winner?.name || 'N/A'}</div>
                    </div>
                    <div class="detail-header-item">
                        <div class="detail-label">Duration</div>
                        <div class="detail-value">${duration}</div>
                    </div>
                </div>
            </div>
        `;

        // Add final standings section
        if (game.completed_at) {
            const rankings = Game.getRankings(game);

            // Separate finished players (with medals) from all players sorted by score
            const finishedPlayers = rankings.filter(p => p.rank !== undefined && p.rank !== null && p.rank > 0);
            const allPlayersSortedByScore = [...rankings].sort((a, b) => a.score - b.score);

            // Show podium if there are finished players
            if (finishedPlayers.length > 0) {
                html += '<div class="detail-section"><h3>🏆 Final Results</h3>';
                html += '<div class="detail-podium-container">';

                // Silver (2nd)
                if (finishedPlayers[1]) {
                    const p = finishedPlayers[1];
                    html += `
                        <div class="detail-podium silver">
                            <div class="detail-podium-medal">🥈</div>
                            <div class="detail-podium-name">${p.name}</div>
                            <div class="detail-podium-label">2nd</div>
                        </div>
                    `;
                }

                // Gold (1st)
                if (finishedPlayers[0]) {
                    const p = finishedPlayers[0];
                    html += `
                        <div class="detail-podium gold">
                            <div class="detail-podium-medal">🥇</div>
                            <div class="detail-podium-name">${p.name}</div>
                            <div class="detail-podium-label">1st</div>
                        </div>
                    `;
                }

                // Bronze (3rd)
                if (finishedPlayers[2]) {
                    const p = finishedPlayers[2];
                    html += `
                        <div class="detail-podium bronze">
                            <div class="detail-podium-medal">🥉</div>
                            <div class="detail-podium-name">${p.name}</div>
                            <div class="detail-podium-label">3rd</div>
                        </div>
                    `;
                }

                html += '</div>';

                // Show remaining players if any
                if (finishedPlayers.length > 3) {
                    html += '<div class="detail-remaining-players">';
                    for (let i = 3; i < finishedPlayers.length; i++) {
                        const p = finishedPlayers[i];
                        html += `
                            <div class="detail-result-item">
                                <span class="detail-result-rank">${p.rank}${p.rank % 10 === 1 && p.rank % 100 !== 11 ? 'st' : p.rank % 10 === 2 && p.rank % 100 !== 12 ? 'nd' : p.rank % 10 === 3 && p.rank % 100 !== 13 ? 'rd' : 'th'}</span>
                                <span class="detail-result-name">${p.name}</span>
                                <span class="detail-result-darts">Darts: ${p.darts}</span>
                            </div>
                        `;
                    }
                    html += '</div>';
                }

                html += '</div>';
            }

            // Always show all players standings sorted by final score
            html += '<div class="detail-section"><h3>📊 Final Standings</h3>';
            html += '<div class="detail-standings-table">';
            allPlayersSortedByScore.forEach((p, index) => {
                const position = index + 1;
                let positionLabel = position + (position % 10 === 1 && position % 100 !== 11 ? 'st' : position % 10 === 2 && position % 100 !== 12 ? 'nd' : position % 10 === 3 && position % 100 !== 13 ? 'rd' : 'th');

                html += `
                    <div class="detail-standings-row">
                        <span class="detail-standings-position">${positionLabel}</span>
                        <span class="detail-standings-name">${p.name}</span>
                        <span class="detail-standings-stats">
                            <span>Score: ${p.score}</span>
                            <span>Turns: ${p.turns}</span>
                            <span>Avg: ${p.avgPerTurn || p.avgPerDart}</span>
                        </span>
                    </div>
                `;
            });
            html += '</div>';
            html += '</div>';
        }

        game.players.forEach(player => {
            html += `
                <div class="player-turns">
                    <div class="player-turns-header">
                        ${player.winner ? '👑 ' : ''}${player.name}
                        <span style="float: right;">Darts: ${player.stats.totalDarts}</span>
                    </div>
            `;

            player.turns.forEach((turn, turnIndex) => {
                const turnTotal = turn.darts.reduce((a, b) => a + b, 0);
                html += `
                    <div class="turn-row">
                        <div class="turn-number">Turn ${turnIndex + 1}</div>
                        <div class="turn-darts-detail">
                            ${turn.darts.map(d => `<div class="turn-dart-box">${d}</div>`).join('')}
                            <div class="turn-dart-box" style="background: #f5f5f5; color: #666;">=</div>
                            <div class="turn-dart-box" style="background: #f5f5f5; color: #666;">${turnTotal}</div>
                        </div>
                        <div class="turn-score-remaining">${turn.remaining}</div>
                    </div>
                `;
            });

            html += `</div>`;
        });

        content.innerHTML = html;
    }

    /**
     * Render leaderboard
     */
    async function renderLeaderboard(metric = 'wins', timeFilter = 'all-time') {
        const container = document.getElementById('leaderboard-content');
        const rankings = await Stats.getLeaderboard(metric, timeFilter);

        if (rankings.length === 0) {
            container.innerHTML = '<p class="placeholder">No games yet</p>';
            return;
        }

        const metricLabel = {
            'wins': 'Wins',
            'win-rate': 'Win Rate',
            'avg-turn': 'Avg/Turn',
            'max-turn': 'Top Turn'
        }[metric] || 'Wins';

        // Build HTML with chart container first
        let html = `
            <div class="leaderboard-chart-section">
                <div class="chart-container chart-container-leaderboard">
                    <canvas id="leaderboardChart"></canvas>
                </div>
            </div>
            <div class="leaderboard-entries">
        `;

        html += rankings.map((entry, index) => {
            const rank = index + 1;
            const rankClass = `rank-${rank}`;
            let metricDisplay = '';

            switch (metric) {
                case 'wins':
                    metricDisplay = entry.stats.gamesWon;
                    break;
                case 'win-rate':
                    metricDisplay = `${entry.stats.winRate}%`;
                    break;
                case 'avg-turn':
                    metricDisplay = entry.stats.avgPerTurn || entry.stats.avgPerDart || '0.00';
                    break;
                case 'max-turn':
                    metricDisplay = entry.stats.maxTurn || entry.fullStats?.maxTurn || 0;
                    break;
            }

            return `
                <div class="leaderboard-entry" onclick="App.viewPlayerProfile('${entry.name}')">
                    <div class="leaderboard-rank ${rankClass}">#${rank}</div>
                    <div class="leaderboard-player">
                        <div class="leaderboard-player-name">${entry.name}</div>
                        <div class="leaderboard-player-detail">
                            ${entry.stats.gamesPlayed} games
                        </div>
                    </div>
                    <div class="leaderboard-stat">
                        <div class="leaderboard-stat-value">${metricDisplay}</div>
                        <div class="leaderboard-stat-label">${metricLabel}</div>
                    </div>
                </div>
            `;
        }).join('');

        html += '</div>';
        container.innerHTML = html;

        // Render leaderboard chart after DOM update
        setTimeout(() => {
            Charts.createLeaderboardChart('leaderboardChart', rankings, metric);
        }, 50);
    }

    /**
     * Render player profile with charts
     */
    async function renderPlayerProfile(playerName) {
        const content = document.getElementById('player-profile-content');

        // Show loading state
        content.innerHTML = '<div class="loading-charts"><p>Loading stats...</p></div>';

        // Fetch all data in parallel for better performance
        const [stats, scoreDistribution, recentPerformance] = await Promise.all([
            Stats.calculatePlayerStats(playerName),
            Stats.getScoreDistribution(playerName),
            Stats.getRecentPerformance(playerName, 10)
        ]);

        let html = `
            <!-- Charts Section -->
            <div class="profile-charts-grid">
                <!-- Win/Loss Chart -->
                <div class="chart-card">
                    <h3>Win/Loss Record</h3>
                    <div class="chart-container chart-container-small">
                        <canvas id="winLossChart"></canvas>
                    </div>
                    <div class="chart-summary">
                        <span class="chart-stat wins">${stats.gamesWon} Wins</span>
                        <span class="chart-stat losses">${stats.gamesPlayed - stats.gamesWon} Losses</span>
                    </div>
                </div>

                <!-- Stats Radar Chart -->
                <div class="chart-card">
                    <h3>Performance Overview</h3>
                    <div class="chart-container chart-container-small">
                        <canvas id="statsRadarChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Performance Trend Chart (Full Width) -->
            <div class="chart-card chart-card-wide">
                <h3>Performance Trend (Last 10 Games)</h3>
                <div class="chart-container chart-container-line">
                    <canvas id="performanceChart"></canvas>
                </div>
            </div>

            <!-- Score Distribution Chart -->
            <div class="chart-card chart-card-wide">
                <h3>Turn Score Distribution</h3>
                <div class="chart-container chart-container-bar">
                    <canvas id="scoreDistributionChart"></canvas>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="profile-section">
                <h3>Overall Stats</h3>
                <div class="stats-matrix">
                    <div class="stat-box">
                        <div class="stat-box-label">Games Played</div>
                        <div class="stat-box-value">${stats.gamesPlayed}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Wins</div>
                        <div class="stat-box-value">${stats.gamesWon}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Win Rate</div>
                        <div class="stat-box-value">${stats.winRate}%</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Avg/Turn</div>
                        <div class="stat-box-value">${stats.avgPerTurn || stats.avgPerDart}</div>
                    </div>
                </div>
            </div>

            <div class="profile-section">
                <h3>Dart Stats</h3>
                <div class="stats-matrix">
                    <div class="stat-box">
                        <div class="stat-box-label">Total Darts</div>
                        <div class="stat-box-value">${stats.totalDarts}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Max Dart</div>
                        <div class="stat-box-value">${stats.maxDart}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Max Turn</div>
                        <div class="stat-box-value">${stats.maxTurn}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">180s</div>
                        <div class="stat-box-value">${stats.total180s}</div>
                    </div>
                </div>
            </div>

            <div class="profile-section">
                <h3>High Scores</h3>
                <div class="stats-matrix">
                    <div class="stat-box">
                        <div class="stat-box-label">140+ Turns</div>
                        <div class="stat-box-value">${stats.total140plus}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">Checkout %</div>
                        <div class="stat-box-value">${stats.checkoutPercentage}%</div>
                    </div>
                </div>
            </div>
        `;

        // Head-to-Head section with chart
        if (Object.keys(stats.headToHead).length > 0) {
            html += `
                <div class="profile-section">
                    <h3>Head-to-Head Records</h3>
                    <div class="chart-container chart-container-h2h">
                        <canvas id="headToHeadChart"></canvas>
                    </div>
                    <div class="head-to-head-list">
                        ${Object.entries(stats.headToHead).map(([opponent, record]) => {
                            const total = record.wins + record.losses;
                            return `
                                <div class="h2h-card">
                                    <div class="h2h-opponent">${opponent}</div>
                                    <div class="h2h-record">
                                        <span class="h2h-wins">${record.wins}W</span>
                                        <span class="h2h-losses">${record.losses}L</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        document.getElementById('profile-player-name').textContent = `${playerName}'s Profile`;
        content.innerHTML = html;

        // Render charts after DOM is updated
        setTimeout(() => {
            // Win/Loss Doughnut Chart
            Charts.createWinLossChart(
                'winLossChart',
                stats.gamesWon,
                stats.gamesPlayed - stats.gamesWon
            );

            // Stats Radar Chart
            Charts.createStatsRadarChart('statsRadarChart', stats);

            // Performance Trend Line Chart
            Charts.createPerformanceChart('performanceChart', recentPerformance);

            // Score Distribution Bar Chart
            Charts.createScoreDistributionChart('scoreDistributionChart', scoreDistribution);

            // Head-to-Head Chart (if data exists)
            if (Object.keys(stats.headToHead).length > 0) {
                Charts.createHeadToHeadChart('headToHeadChart', stats.headToHead);
            }
        }, 50);
    }

    /**
     * Update active game UI
     */
    function updateActiveGameUI(game, animate = false) {
        renderScoreboard(game);
        renderCurrentPlayer(game);
        renderDartInputs(game);
        renderTurnHistory(game);

        // Update live rankings with current game standings
        const rankings = Game.getRankings(game);
        updateWinnersBoard(rankings, animate);
    }

    /**
     * Render game in spectator mode (read-only view)
     */
    function renderSpectatorGame(game) {
        renderScoreboard(game);
        renderCurrentPlayer(game);
        renderTurnHistory(game);

        // Hide dart input controls for spectator
        const dartEntrySection = document.querySelector('.dart-entry-section');
        if (dartEntrySection) {
            dartEntrySection.style.display = 'none';
        }

        // Show spectator indicator (only add once)
        const pageHeader = document.querySelector('.page-header');
        if (pageHeader && !document.getElementById('spectator-indicator')) {
            const spectatorIndicator = document.createElement('div');
            spectatorIndicator.id = 'spectator-indicator';
            spectatorIndicator.style.cssText = 'display: flex; align-items: center; gap: 8px; color: #7d5f92; font-weight: 600; font-size: 14px; padding: 8px 16px; background: rgba(125, 95, 146, 0.1); border-radius: 6px; margin-left: 16px;';
            spectatorIndicator.innerHTML = '<span id="live-indicator" style="display: none;">🔴</span> 📺 Spectator Mode';
            pageHeader.appendChild(spectatorIndicator);
        }

        // Update live rankings with current game standings
        const rankings = Game.getRankings(game);
        updateWinnersBoard(rankings, false);

        // Show spectator-specific leaderboard with player stats from current game
        renderSpectatorLeaderboard(game);
    }

    /**
     * Show/hide live indicator for spectator mode
     */
    function showLiveIndicator(isLive) {
        const indicator = document.getElementById('live-indicator');
        if (indicator) {
            indicator.style.display = isLive ? 'inline' : 'none';
            indicator.title = isLive ? 'Connected - Live updates enabled' : 'Disconnected';
        }
    }

    /**
     * Render leaderboard for spectator view showing players in current game
     */
    async function renderSpectatorLeaderboard(game) {
        try {
            // Find or create a container for spectator leaderboard
            let leaderboardContainer = document.getElementById('spectator-leaderboard-container');

            if (!leaderboardContainer) {
                // Create container after turn history
                const turnHistorySection = document.querySelector('.turn-history-section');
                if (turnHistorySection) {
                    leaderboardContainer = document.createElement('div');
                    leaderboardContainer.id = 'spectator-leaderboard-container';
                    leaderboardContainer.className = 'spectator-leaderboard';
                    leaderboardContainer.style.cssText = 'background: var(--color-bg-lighter); border-radius: var(--radius-lg); padding: var(--spacing-xl); box-shadow: var(--shadow-md); margin-top: var(--spacing-xl);';
                    turnHistorySection.parentNode.insertBefore(leaderboardContainer, turnHistorySection.nextSibling);
                }
            }

            if (!leaderboardContainer) return;

            // Build leaderboard for players in this game
            let html = '<h3 style="margin-top: 0; color: var(--color-primary-dark); text-align: center;">👥 Player Leaderboard</h3>';
            html += '<div style="display: flex; flex-direction: column; gap: 8px;">';

            // Sort players by current score (lowest remaining is best)
            const sortedPlayers = [...game.players].sort((a, b) => {
                // Finished players first (by rank)
                if (a.winner && b.winner) {
                    return (a.finish_rank || 999) - (b.finish_rank || 999);
                }
                if (a.winner) return -1;
                if (b.winner) return 1;
                // Then by current score (lowest first)
                return a.currentScore - b.currentScore;
            });

            sortedPlayers.forEach((player, index) => {
                const stats = player.stats;
                let statusIcon = '';
                let statusText = '';

                if (player.winner) {
                    const medals = ['🥇', '🥈', '🥉'];
                    statusIcon = medals[player.finish_rank - 1] || '🏅';
                    statusText = `Finished - ${player.finish_rank}${player.finish_rank % 10 === 1 && player.finish_rank % 100 !== 11 ? 'st' : player.finish_rank % 10 === 2 && player.finish_rank % 100 !== 12 ? 'nd' : player.finish_rank % 10 === 3 && player.finish_rank % 100 !== 13 ? 'rd' : 'th'}`;
                } else {
                    statusIcon = '▶️';
                    statusText = `Playing - ${player.currentScore} remaining`;
                }

                html += `
                    <div style="display: grid; grid-template-columns: 50px 1fr 150px; gap: 12px; align-items: center; padding: 12px; background: var(--color-bg-light); border-radius: 6px; border-left: 4px solid var(--color-primary);">
                        <div style="text-align: center; font-size: 20px;">${statusIcon}</div>
                        <div>
                            <div style="font-weight: 600; color: var(--color-text-dark); margin-bottom: 4px;">${player.name}</div>
                            <div style="font-size: 12px; color: var(--color-text-light);">${statusText}</div>
                        </div>
                        <div style="text-align: right; font-size: 12px; color: var(--color-text-light);">
                            <div style="font-weight: 600; color: var(--color-primary);">${player.turns.length} turns</div>
                            <div>${stats.totalDarts} darts • Avg: ${player.turns.length > 0 ? (stats.totalScore / player.turns.length).toFixed(1) : '—'}</div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            leaderboardContainer.innerHTML = html;
        } catch (error) {
            console.error('Error rendering spectator leaderboard:', error);
        }
    }

    // Store previous rankings for animation tracking
    let previousRankings = {};
    let previousPositions = {}; // Track position changes

    /**
     * Update live rankings board with Olympic medal podium style
     * Shows finished players in medal podium, then active players below
     * @param {Array} rankings - Player rankings
     * @param {Boolean} animate - Whether to animate rank changes (only on round completion)
     */
    function updateWinnersBoard(rankings, animate = false) {
        const board = document.getElementById('live-rankings');
        const rankList = document.getElementById('rankings-list');
        const rankEmojis = ['🥇', '🥈', '🥉'];
        const rankLabels = ['1st', '2nd', '3rd'];

        if (!rankings || rankings.length === 0) {
            board.classList.add('hidden');
            return;
        }

        // Separate finished and active players
        const finishedPlayers = rankings.filter(p => p.rank !== undefined && p.rank !== null && p.rank > 0)
            .sort((a, b) => a.rank - b.rank);
        const activePlayers = rankings.filter(p => !(p.rank !== undefined && p.rank !== null && p.rank > 0))
            .sort((a, b) => a.score - b.score);

        let html = '';

        // Show podium for finished players (top 3)
        if (finishedPlayers.length > 0) {
            html += '<div class="podium-container">';

            // Silver (2nd place)
            if (finishedPlayers[1]) {
                const player = finishedPlayers[1];
                html += `
                    <div class="podium-position silver" data-player="${player.name}">
                        <div class="podium-medal">🥈</div>
                        <div class="podium-name">${player.name}</div>
                        <div class="podium-rank">2nd</div>
                        <div class="podium-height"></div>
                    </div>
                `;
            }

            // Gold (1st place)
            if (finishedPlayers[0]) {
                const player = finishedPlayers[0];
                html += `
                    <div class="podium-position gold" data-player="${player.name}">
                        <div class="podium-medal">🥇</div>
                        <div class="podium-name">${player.name}</div>
                        <div class="podium-rank">1st</div>
                        <div class="podium-height gold-height"></div>
                    </div>
                `;
            }

            // Bronze (3rd place)
            if (finishedPlayers[2]) {
                const player = finishedPlayers[2];
                html += `
                    <div class="podium-position bronze" data-player="${player.name}">
                        <div class="podium-medal">🥉</div>
                        <div class="podium-name">${player.name}</div>
                        <div class="podium-rank">3rd</div>
                        <div class="podium-height"></div>
                    </div>
                `;
            }

            html += '</div>';

            // Additional finished players (4th+)
            if (finishedPlayers.length > 3) {
                html += '<div class="other-finished-header">Other Finalists</div>';
                for (let i = 3; i < finishedPlayers.length; i++) {
                    const player = finishedPlayers[i];
                    const suffix = i === 3 ? 'th' : i === 4 ? 'th' : 'th';
                    html += `
                        <div class="ranking-item finished" data-player="${player.name}">
                            <div class="ranking-medal">🏅</div>
                            <div class="ranking-info">
                                <div class="ranking-name">${player.name}</div>
                                <div class="ranking-detail">✓ ${player.rank}${suffix}</div>
                            </div>
                            <div class="ranking-score">
                                <div>0</div>
                                <div class="ranking-darts">Darts: ${player.darts}</div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        // Show active players if any
        if (activePlayers.length > 0) {
            if (finishedPlayers.length > 0) {
                html += '<div class="active-header">In Progress</div>';
            }

            activePlayers.forEach((player, index) => {
                let scoreChangeIndicator = '';
                let positionChangeIndicator = '';
                let animationClass = '';

                // Calculate position
                const position = finishedPlayers.length + index + 1;
                let suffix = 'th';
                if (position % 10 === 1 && position % 100 !== 11) suffix = 'st';
                else if (position % 10 === 2 && position % 100 !== 12) suffix = 'nd';
                else if (position % 10 === 3 && position % 100 !== 13) suffix = 'rd';
                const positionLabel = position + suffix;

                // Only show changes if animating (round completed)
                if (animate) {
                    // Score changes
                    const prevScore = previousRankings[player.name];
                    if (prevScore !== undefined && prevScore !== player.score) {
                        if (prevScore > player.score) {
                            scoreChangeIndicator = ' ↓ ' + (prevScore - player.score);
                            animationClass = 'score-down';
                        } else {
                            scoreChangeIndicator = ' ↑ ' + (player.score - prevScore);
                            animationClass = 'score-up';
                        }
                    }

                    // Position changes
                    const prevPosition = previousPositions[player.name];
                    if (prevPosition !== undefined && prevPosition !== position) {
                        if (prevPosition > position) {
                            positionChangeIndicator = ' 📈'; // Moved up
                            animationClass += ' position-up';
                        } else if (prevPosition < position) {
                            positionChangeIndicator = ' 📉'; // Moved down
                            animationClass += ' position-down';
                        }
                    } else if (prevPosition !== undefined && prevPosition === position) {
                        positionChangeIndicator = ' ➡️'; // Stayed same
                    }
                }

                html += `
                    <div class="ranking-item active ${animationClass}" data-player="${player.name}">
                        <div class="ranking-medal">${positionLabel}</div>
                        <div class="ranking-info">
                            <div class="ranking-name">${player.name}</div>
                            <div class="ranking-detail">In Progress${scoreChangeIndicator}${positionChangeIndicator}</div>
                        </div>
                        <div class="ranking-score">
                            <div>${player.score}</div>
                            <div class="ranking-darts">Darts: ${player.darts}</div>
                        </div>
                    </div>
                `;

                // Only update previous rankings if animating
                if (animate) {
                    previousRankings[player.name] = player.score;
                    previousPositions[player.name] = position;
                }
            });
        }

        rankList.innerHTML = html;
        board.classList.remove('hidden');

        // Trigger animation only if animate is true
        if (animate) {
            setTimeout(() => {
                document.querySelectorAll('.ranking-item.score-up, .ranking-item.score-down').forEach(item => {
                    item.classList.remove('score-up', 'score-down');
                });
            }, 300);
        }
    }

    /**
     * Render the global stats page
     */
    async function renderStatsPage() {
        const summaryContainer = document.getElementById('global-stats-summary');
        const widgetsContainer = document.getElementById('player-stats-widgets');
        const playerSelect = document.getElementById('stats-player-select');

        // Show loading
        summaryContainer.innerHTML = '<div class="loading-charts"><p>Loading statistics...</p></div>';
        widgetsContainer.innerHTML = '';

        // Get global stats and player names
        const [globalStats, playerNames] = await Promise.all([
            Stats.getGlobalStats(),
            Stats.getAllPlayerNames()
        ]);

        // Populate player dropdown
        playerSelect.innerHTML = '<option value="">-- Select Player --</option>' +
            playerNames.map(name => `<option value="${name}">${name}</option>`).join('');

        // Also populate comparison dropdowns
        const compareSelect1 = document.getElementById('compare-player-1');
        const compareSelect2 = document.getElementById('compare-player-2');
        if (compareSelect1 && compareSelect2) {
            const options = '<option value="">Select Player</option>' +
                playerNames.map(name => `<option value="${name}">${name}</option>`).join('');
            compareSelect1.innerHTML = options;
            compareSelect2.innerHTML = options;
        }

        // Render global stats summary with animated counters
        const counters = [];

        let html = `
            <!-- Global Stats Cards -->
            <div class="global-stats-grid">
                <div class="global-stat-card">
                    <div class="global-stat-icon">🎮</div>
                    <div class="global-stat-content">
                        <div class="global-stat-value" id="counter-games">${globalStats.totalGames}</div>
                        <div class="global-stat-label">Total Games</div>
                    </div>
                </div>
                <div class="global-stat-card">
                    <div class="global-stat-icon">👥</div>
                    <div class="global-stat-content">
                        <div class="global-stat-value" id="counter-players">${globalStats.totalPlayers}</div>
                        <div class="global-stat-label">Active Players</div>
                    </div>
                </div>
                <div class="global-stat-card">
                    <div class="global-stat-icon">🎯</div>
                    <div class="global-stat-content">
                        <div class="global-stat-value" id="counter-darts">${globalStats.totalDarts.toLocaleString()}</div>
                        <div class="global-stat-label">Darts Thrown</div>
                    </div>
                </div>
                <div class="global-stat-card">
                    <div class="global-stat-icon">📊</div>
                    <div class="global-stat-content">
                        <div class="global-stat-value" id="counter-score">${globalStats.totalScore.toLocaleString()}</div>
                        <div class="global-stat-label">Total Points</div>
                    </div>
                </div>
                <div class="global-stat-card highlight">
                    <div class="global-stat-icon">🔥</div>
                    <div class="global-stat-content">
                        <div class="global-stat-value" id="counter-180s">${globalStats.total180s}</div>
                        <div class="global-stat-label">Total 180s</div>
                    </div>
                </div>
                <div class="global-stat-card">
                    <div class="global-stat-icon">⚡</div>
                    <div class="global-stat-content">
                        <div class="global-stat-value" id="counter-140s">${globalStats.total140plus}</div>
                        <div class="global-stat-label">140+ Turns</div>
                    </div>
                </div>
            </div>

            <!-- Records Section -->
            <div class="records-section">
                <h3>🏅 All-Time Records</h3>
                <div class="records-grid">
                    <div class="record-card">
                        <div class="record-icon">📈</div>
                        <div class="record-content">
                            <div class="record-value">${globalStats.records.highestAvg || '0.00'}</div>
                            <div class="record-label">Best Avg/Turn</div>
                            <div class="record-holder">${globalStats.records.highestAvgPlayer || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="record-card">
                        <div class="record-icon">🎯</div>
                        <div class="record-content">
                            <div class="record-value">${globalStats.records.most180s || 0}</div>
                            <div class="record-label">Most 180s</div>
                            <div class="record-holder">${globalStats.records.most180sPlayer || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="record-card">
                        <div class="record-icon">💥</div>
                        <div class="record-content">
                            <div class="record-value">${globalStats.records.highestMaxTurn || 0}</div>
                            <div class="record-label">Highest Turn</div>
                            <div class="record-holder">${globalStats.records.highestMaxTurnPlayer || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Fun Facts Section -->
            <div class="fun-facts-section">
                <h3>📊 Fun Facts</h3>
                <div class="fun-facts-grid">
                    <div class="fun-fact">
                        <span class="fun-fact-value">${globalStats.averagePerDart}</span>
                        <span class="fun-fact-label">Global Avg per Dart</span>
                    </div>
                    <div class="fun-fact">
                        <span class="fun-fact-value">${globalStats.totalDarts > 0 ? Math.round(globalStats.totalDarts / Math.max(globalStats.totalGames, 1)) : 0}</span>
                        <span class="fun-fact-label">Avg Darts per Game</span>
                    </div>
                    <div class="fun-fact">
                        <span class="fun-fact-value">${globalStats.totalGames > 0 ? (globalStats.total180s / globalStats.totalGames).toFixed(2) : 0}</span>
                        <span class="fun-fact-label">180s per Game</span>
                    </div>
                </div>
            </div>
        `;

        summaryContainer.innerHTML = html;

        // Initial placeholder for player widgets
        widgetsContainer.innerHTML = `
            <div class="player-widgets-placeholder">
                <p>👆 Select a player above to see detailed statistics, achievements, and performance trends</p>
            </div>
        `;
    }

    /**
     * Render player-specific widgets on stats page
     */
    async function renderPlayerStatsWidgets(playerName) {
        const container = document.getElementById('player-stats-widgets');
        if (!playerName) {
            container.innerHTML = `
                <div class="player-widgets-placeholder">
                    <p>👆 Select a player above to see detailed statistics, achievements, and performance trends</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '<div class="loading-charts"><p>Loading player stats...</p></div>';

        // Get player data
        const [stats, scoreDistribution, recentPerformance] = await Promise.all([
            Stats.calculatePlayerStats(playerName),
            Stats.getScoreDistribution(playerName),
            Stats.getRecentPerformance(playerName, 20)
        ]);

        const prefs = StatsWidgets.getPreferences();

        let html = `<div class="player-widgets-header"><h2>${playerName}'s Dashboard</h2></div>`;

        // Achievements section
        if (prefs.showAchievements) {
            const achievementsHtml = StatsWidgets.renderAchievementBadges(stats, false);
            html += `
                <div class="widget-section achievements-container" data-player="${playerName}">
                    <h3>🏆 Achievements</h3>
                    ${achievementsHtml}
                </div>
            `;
        }

        // Streaks section
        if (prefs.showStreaks) {
            const streakData = StatsWidgets.calculateStreaks(recentPerformance);
            html += `
                <div class="widget-section">
                    <h3>🔥 Current Form</h3>
                    ${StatsWidgets.renderStreaks(streakData)}
                </div>
            `;
        }

        // Progress Rings section
        if (prefs.showProgressRings) {
            html += `
                <div class="widget-section">
                    <h3>🎯 Goal Progress</h3>
                    ${StatsWidgets.renderProgressRings(stats, prefs.goals)}
                </div>
            `;
        }

        // Charts row
        html += `
            <div class="charts-row">
                <div class="chart-card">
                    <h3>Win/Loss Record</h3>
                    <div class="chart-container chart-container-small">
                        <canvas id="playerWinLossChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <h3>Performance Overview</h3>
                    <div class="chart-container chart-container-small">
                        <canvas id="playerRadarChart"></canvas>
                    </div>
                </div>
            </div>
            <div class="chart-card chart-card-wide">
                <h3>Performance Trend</h3>
                <div class="chart-container chart-container-line">
                    <canvas id="playerPerformanceChart"></canvas>
                </div>
            </div>
            <div class="chart-card chart-card-wide">
                <h3>Score Distribution</h3>
                <div class="chart-container chart-container-bar">
                    <canvas id="playerScoreDistChart"></canvas>
                </div>
            </div>
        `;

        // Activity Heatmap section
        if (prefs.showHeatmap) {
            const activityData = await StatsWidgets.getActivityData(playerName, 84);
            html += `
                <div class="widget-section">
                    <h3>📅 Activity (Last 12 Weeks)</h3>
                    ${StatsWidgets.renderActivityHeatmap(activityData, 12)}
                </div>
            `;
        }

        container.innerHTML = html;

        // Render charts
        setTimeout(() => {
            Charts.createWinLossChart('playerWinLossChart', stats.gamesWon, stats.gamesPlayed - stats.gamesWon);
            Charts.createStatsRadarChart('playerRadarChart', stats);
            Charts.createPerformanceChart('playerPerformanceChart', recentPerformance);
            Charts.createScoreDistributionChart('playerScoreDistChart', scoreDistribution);
        }, 50);
    }

    /**
     * Open comparison modal
     */
    function openComparisonModal() {
        const modal = document.getElementById('comparison-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * Close comparison modal
     */
    function closeComparisonModal() {
        const modal = document.getElementById('comparison-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Run player comparison
     */
    async function runPlayerComparison() {
        const player1 = document.getElementById('compare-player-1')?.value;
        const player2 = document.getElementById('compare-player-2')?.value;
        const resultContainer = document.getElementById('comparison-result');

        if (!player1 || !player2) {
            resultContainer.innerHTML = '<p class="error">Please select both players</p>';
            return;
        }

        if (player1 === player2) {
            resultContainer.innerHTML = '<p class="error">Please select different players</p>';
            return;
        }

        resultContainer.innerHTML = '<div class="loading-charts"><p>Comparing...</p></div>';

        const [stats1, stats2] = await Promise.all([
            Stats.calculatePlayerStats(player1),
            Stats.calculatePlayerStats(player2)
        ]);

        let html = StatsWidgets.renderPlayerComparison(stats1, stats2, player1, player2);
        html += `
            <div class="comparison-chart-container">
                <canvas id="comparisonRadarChart"></canvas>
            </div>
        `;

        resultContainer.innerHTML = html;

        // Render comparison radar chart
        setTimeout(() => {
            StatsWidgets.createComparisonRadarChart('comparisonRadarChart', stats1, stats2, player1, player2);
        }, 50);
    }

    // ============================================================================
    // COMPETITION RENDERING FUNCTIONS
    // ============================================================================

    /**
     * Render competitions hub page
     */
    async function renderCompetitionsHub(activeTab = 'tournaments') {
        const container = document.getElementById('competitions-content');
        if (!container) return;

        container.innerHTML = '<p class="placeholder">Loading competitions...</p>';

        try {
            if (activeTab === 'tournaments') {
                const tournaments = await Storage.getTournaments();
                renderTournamentsList(container, tournaments);
            } else {
                const leagues = await Storage.getLeagues();
                renderLeaguesList(container, leagues);
            }
        } catch (error) {
            console.error('Error rendering competitions:', error);
            container.innerHTML = '<p class="placeholder">Error loading competitions</p>';
        }
    }

    /**
     * Render tournaments list
     */
    function renderTournamentsList(container, tournaments) {
        if (tournaments.length === 0) {
            container.innerHTML = '<p class="placeholder">No tournaments yet. Create your first tournament!</p>';
            return;
        }

        const html = tournaments.map(t => {
            const statusColors = {
                'registration': '#ff9800',
                'in_progress': '#4caf50',
                'completed': '#9e9e9e'
            };
            const statusLabels = {
                'registration': 'Registration Open',
                'in_progress': 'In Progress',
                'completed': 'Completed'
            };

            const participantCount = t.participants?.length || 0;
            const completedMatches = t.matches?.filter(m => m.status === 'completed').length || 0;
            const totalMatches = t.matches?.length || 0;

            return `
                <div class="competition-card" onclick="Router.navigate('tournament', {tournamentId: '${t.id}'})">
                    <div class="competition-card-header">
                        <div class="competition-card-title">${t.name}</div>
                        <span class="competition-status-badge" style="background: ${statusColors[t.status]};">
                            ${statusLabels[t.status]}
                        </span>
                    </div>
                    <div class="competition-card-info">
                        <span>${t.format === 'single_elimination' ? 'Single Elim.' : 'Double Elim.'}</span>
                        <span>${t.game_type} Points</span>
                        <span>${participantCount}/${t.max_players} Players</span>
                    </div>
                    <div class="competition-card-footer">
                        ${t.status === 'completed'
                            ? `<span>Winner: ${t.winner_name || 'TBD'}</span>`
                            : `<span>Matches: ${completedMatches}/${totalMatches}</span>`
                        }
                        <span>${new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    /**
     * Render leagues list
     */
    function renderLeaguesList(container, leagues) {
        if (leagues.length === 0) {
            container.innerHTML = '<p class="placeholder">No leagues yet. Create your first league!</p>';
            return;
        }

        const html = leagues.map(l => {
            const statusColors = {
                'registration': '#ff9800',
                'in_progress': '#4caf50',
                'completed': '#9e9e9e'
            };
            const statusLabels = {
                'registration': 'Registration Open',
                'in_progress': 'In Progress',
                'completed': 'Completed'
            };

            const participantCount = l.participants?.length || 0;
            const completedMatches = l.matches?.filter(m => m.status === 'completed').length || 0;
            const totalMatches = l.matches?.length || 0;
            const progress = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

            return `
                <div class="competition-card" onclick="Router.navigate('league', {leagueId: '${l.id}'})">
                    <div class="competition-card-header">
                        <div class="competition-card-title">${l.name}</div>
                        <span class="competition-status-badge" style="background: ${statusColors[l.status]};">
                            ${statusLabels[l.status]}
                        </span>
                    </div>
                    <div class="competition-card-info">
                        <span>Round Robin</span>
                        <span>${l.game_type} Points</span>
                        <span>${participantCount} Players</span>
                    </div>
                    ${l.status === 'in_progress' ? `
                        <div class="competition-progress">
                            <div class="competition-progress-bar" style="width: ${progress}%;"></div>
                        </div>
                    ` : ''}
                    <div class="competition-card-footer">
                        ${l.status === 'completed'
                            ? `<span>Winner: ${l.winner_name || 'TBD'}</span>`
                            : `<span>Progress: ${completedMatches}/${totalMatches} matches</span>`
                        }
                        <span>${new Date(l.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    /**
     * Render tournament detail view with bracket
     */
    async function renderTournamentDetail(tournament) {
        const container = document.getElementById('tournament-detail-content');
        if (!container || !tournament) return;

        const totalRounds = Math.log2(tournament.max_players);
        const bracket = Tournament.getBracket(tournament);

        let html = `
            <div class="tournament-header">
                <div class="tournament-info">
                    <h2>${tournament.name}</h2>
                    <div class="tournament-meta">
                        <span>${tournament.format === 'single_elimination' ? 'Single Elimination' : 'Double Elimination'}</span>
                        <span>${tournament.game_type} Points</span>
                        <span>${tournament.participants?.length || 0}/${tournament.max_players} Players</span>
                    </div>
                </div>
                ${tournament.status === 'completed' ? `
                    <div class="tournament-winner">
                        <span class="winner-label">Champion</span>
                        <span class="winner-name">${tournament.winner_name}</span>
                    </div>
                ` : ''}
            </div>
        `;

        // Registration phase - show player management
        if (tournament.status === 'registration') {
            html += renderTournamentRegistration(tournament);
        } else {
            // In progress or completed - show bracket
            html += renderTournamentBracket(tournament, bracket, totalRounds);
        }

        // Ready matches section
        if (tournament.status === 'in_progress') {
            const readyMatches = Tournament.getReadyMatches(tournament);
            const inProgressMatches = Tournament.getInProgressMatches(tournament);

            if (inProgressMatches.length > 0) {
                html += `
                    <div class="matches-section">
                        <h3>In Progress</h3>
                        <div class="matches-list">
                            ${inProgressMatches.map(m => `
                                <div class="match-card in-progress" onclick="Router.navigate('game', {gameId: '${m.game_id}'})">
                                    <div class="match-players">
                                        <span>${m.player1_name}</span>
                                        <span class="vs">vs</span>
                                        <span>${m.player2_name}</span>
                                    </div>
                                    <div class="match-round">${Tournament.getRoundName(m.round, totalRounds, tournament.format)}</div>
                                    <button class="btn btn-small btn-primary">Watch</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            if (readyMatches.length > 0) {
                html += `
                    <div class="matches-section">
                        <h3>Ready to Play</h3>
                        <div class="matches-list">
                            ${readyMatches.map(m => `
                                <div class="match-card ready" data-match-id="${m.id}">
                                    <div class="match-players">
                                        <span>${m.player1_name}</span>
                                        <span class="vs">vs</span>
                                        <span>${m.player2_name}</span>
                                    </div>
                                    <div class="match-round">${Tournament.getRoundName(m.round, totalRounds, tournament.format)}</div>
                                    <button class="btn btn-small btn-success start-match-btn">Start Match</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = html;
    }

    /**
     * Render tournament registration view
     */
    function renderTournamentRegistration(tournament) {
        let html = `
            <div class="registration-section">
                <h3>Player Registration (${tournament.participants?.length || 0}/${tournament.max_players})</h3>
                <div class="player-input-row">
                    <input type="text" id="new-participant-name" placeholder="Enter player name" class="form-input">
                    <button class="btn btn-primary" id="add-participant-btn">Add Player</button>
                </div>
                <div class="participants-list">
                    ${(tournament.participants || []).map((p, i) => `
                        <div class="participant-item">
                            <span class="participant-position">#${i + 1}</span>
                            <span class="participant-name">${p.name}</span>
                            <button class="btn btn-small btn-danger remove-participant-btn" data-name="${p.name}">Remove</button>
                        </div>
                    `).join('')}
                </div>
                ${tournament.participants?.length >= 2 ? `
                    <div class="registration-actions">
                        <button class="btn btn-secondary" id="shuffle-participants-btn">Shuffle Order</button>
                        <button class="btn btn-success btn-large" id="start-tournament-btn">Start Tournament</button>
                    </div>
                ` : ''}
            </div>
        `;
        return html;
    }

    /**
     * Render tournament bracket visualization
     */
    function renderTournamentBracket(tournament, bracket, totalRounds) {
        let html = '<div class="bracket-container">';

        // Winners bracket
        html += '<div class="bracket-section winners-bracket">';
        html += '<h4>Winners Bracket</h4>';
        html += '<div class="bracket-rounds">';

        for (let round = 1; round <= totalRounds; round++) {
            const roundMatches = bracket.winners[round] || [];
            const roundName = Tournament.getRoundName(round, totalRounds, tournament.format);

            html += `
                <div class="bracket-round">
                    <div class="round-header">${roundName}</div>
                    <div class="round-matches">
                        ${roundMatches.map(m => renderBracketMatch(m)).join('')}
                    </div>
                </div>
            `;
        }

        html += '</div></div>';

        // Losers bracket (if double elimination)
        if (tournament.format === 'double_elimination' && Object.keys(bracket.losers).length > 0) {
            html += '<div class="bracket-section losers-bracket">';
            html += '<h4>Losers Bracket</h4>';
            html += '<div class="bracket-rounds">';

            Object.keys(bracket.losers).sort((a, b) => a - b).forEach(round => {
                const roundMatches = bracket.losers[round] || [];
                html += `
                    <div class="bracket-round">
                        <div class="round-header">Losers Round ${round}</div>
                        <div class="round-matches">
                            ${roundMatches.map(m => renderBracketMatch(m)).join('')}
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';

            // Grand finals
            if (bracket.grandFinals) {
                html += '<div class="bracket-section grand-finals">';
                html += '<h4>Grand Finals</h4>';
                html += renderBracketMatch(bracket.grandFinals);
                html += '</div>';
            }
        }

        html += '</div>';
        return html;
    }

    /**
     * Render a single bracket match
     */
    function renderBracketMatch(match) {
        const statusClass = match.status === 'completed' ? 'completed' :
                           match.status === 'ready' ? 'ready' :
                           match.status === 'in_progress' ? 'in-progress' : 'pending';

        return `
            <div class="bracket-match ${statusClass}" data-match-id="${match.id}">
                <div class="match-slot ${match.winner_id === match.player1_id ? 'winner' : ''}">
                    <span class="player-name">${match.player1_name || 'TBD'}</span>
                    ${match.status === 'completed' && match.winner_id === match.player1_id ? '<span class="winner-mark">✓</span>' : ''}
                </div>
                <div class="match-slot ${match.winner_id === match.player2_id ? 'winner' : ''}">
                    <span class="player-name">${match.player2_name || 'TBD'}</span>
                    ${match.status === 'completed' && match.winner_id === match.player2_id ? '<span class="winner-mark">✓</span>' : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render league detail view
     */
    async function renderLeagueDetail(league) {
        const container = document.getElementById('league-detail-content');
        if (!container || !league) return;

        let html = `
            <div class="league-header">
                <div class="league-info">
                    <h2>${league.name}</h2>
                    <div class="league-meta">
                        <span>Round Robin</span>
                        <span>${league.game_type} Points</span>
                        <span>${league.participants?.length || 0} Players</span>
                        <span>W:${league.points_for_win} D:${league.points_for_draw} L:${league.points_for_loss}</span>
                    </div>
                </div>
                ${league.status === 'completed' ? `
                    <div class="league-winner">
                        <span class="winner-label">Champion</span>
                        <span class="winner-name">${league.winner_name}</span>
                    </div>
                ` : ''}
            </div>
        `;

        // Registration phase
        if (league.status === 'registration') {
            html += renderLeagueRegistration(league);
        } else {
            // Show standings table
            html += renderLeagueStandings(league);

            // Show fixtures
            html += renderLeagueFixtures(league);
        }

        container.innerHTML = html;
    }

    /**
     * Render league registration view
     */
    function renderLeagueRegistration(league) {
        let html = `
            <div class="registration-section">
                <h3>Player Registration (${league.participants?.length || 0} players)</h3>
                <div class="player-input-row">
                    <input type="text" id="new-participant-name" placeholder="Enter player name" class="form-input">
                    <button class="btn btn-primary" id="add-participant-btn">Add Player</button>
                </div>
                <div class="participants-list">
                    ${(league.participants || []).map((p, i) => `
                        <div class="participant-item">
                            <span class="participant-position">#${i + 1}</span>
                            <span class="participant-name">${p.name}</span>
                            <button class="btn btn-small btn-danger remove-participant-btn" data-name="${p.name}">Remove</button>
                        </div>
                    `).join('')}
                </div>
                ${league.participants?.length >= 2 ? `
                    <div class="registration-actions">
                        <button class="btn btn-success btn-large" id="start-league-btn">Generate Fixtures & Start</button>
                    </div>
                ` : ''}
            </div>
        `;
        return html;
    }

    /**
     * Render league standings table
     */
    function renderLeagueStandings(league) {
        const standings = League.getStandings(league);

        let html = `
            <div class="standings-section">
                <h3>Standings</h3>
                <div class="standings-table">
                    <div class="standings-header">
                        <span class="col-rank">#</span>
                        <span class="col-name">Player</span>
                        <span class="col-p">P</span>
                        <span class="col-w">W</span>
                        <span class="col-d">D</span>
                        <span class="col-l">L</span>
                        <span class="col-diff">+/-</span>
                        <span class="col-pts">PTS</span>
                    </div>
                    ${standings.map((p, i) => `
                        <div class="standings-row ${i === 0 ? 'leader' : ''}">
                            <span class="col-rank">${p.rank}</span>
                            <span class="col-name">${p.name}</span>
                            <span class="col-p">${p.played}</span>
                            <span class="col-w">${p.wins}</span>
                            <span class="col-d">${p.draws}</span>
                            <span class="col-l">${p.losses}</span>
                            <span class="col-diff">${p.legDiff >= 0 ? '+' : ''}${p.legDiff}</span>
                            <span class="col-pts">${p.points}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        return html;
    }

    /**
     * Render league fixtures
     */
    function renderLeagueFixtures(league) {
        const fixturesByRound = League.getFixturesByRound(league);
        const pendingMatches = League.getPendingMatches(league);
        const inProgressMatches = League.getInProgressMatches(league);

        let html = '';

        // In progress matches
        if (inProgressMatches.length > 0) {
            html += `
                <div class="fixtures-section">
                    <h3>In Progress</h3>
                    <div class="fixtures-list">
                        ${inProgressMatches.map(m => `
                            <div class="fixture-card in-progress" onclick="Router.navigate('game', {gameId: '${m.game_id}'})">
                                <span class="fixture-player">${m.player1_name}</span>
                                <span class="fixture-vs">vs</span>
                                <span class="fixture-player">${m.player2_name}</span>
                                <button class="btn btn-small btn-primary">Watch</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Pending matches (ready to play)
        if (pendingMatches.length > 0 && league.status === 'in_progress') {
            html += `
                <div class="fixtures-section">
                    <h3>Ready to Play</h3>
                    <div class="fixtures-list">
                        ${pendingMatches.slice(0, 10).map(m => `
                            <div class="fixture-card pending" data-match-id="${m.id}">
                                <span class="fixture-player">${m.player1_name}</span>
                                <span class="fixture-vs">vs</span>
                                <span class="fixture-player">${m.player2_name}</span>
                                <button class="btn btn-small btn-success start-match-btn">Play</button>
                            </div>
                        `).join('')}
                        ${pendingMatches.length > 10 ? `<p class="more-fixtures">+ ${pendingMatches.length - 10} more fixtures</p>` : ''}
                    </div>
                </div>
            `;
        }

        // All fixtures by round
        html += `
            <div class="fixtures-section">
                <h3>All Fixtures</h3>
                ${Object.keys(fixturesByRound).map(round => `
                    <div class="fixture-round">
                        <div class="fixture-round-header">Round ${round}</div>
                        <div class="fixtures-list">
                            ${fixturesByRound[round].map(m => {
                                const statusClass = m.status === 'completed' ? 'completed' :
                                                   m.status === 'in_progress' ? 'in-progress' : 'pending';
                                return `
                                    <div class="fixture-card ${statusClass}" ${m.game_id ? `onclick="Router.navigate('game-detail', {gameId: '${m.game_id}'})"` : ''}>
                                        <span class="fixture-player ${m.winner_id === m.player1_id ? 'winner' : ''}">${m.player1_name}</span>
                                        <span class="fixture-result">
                                            ${m.status === 'completed'
                                                ? (m.is_draw ? 'Draw' : (m.winner_name || ''))
                                                : 'vs'
                                            }
                                        </span>
                                        <span class="fixture-player ${m.winner_id === m.player2_id ? 'winner' : ''}">${m.player2_name}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        return html;
    }

    /**
     * Render new tournament form
     */
    function renderNewTournamentForm() {
        // Initialize player count handling
        const playerCountInput = document.getElementById('tournament-player-count');
        const playerNamesContainer = document.getElementById('tournament-player-names');

        if (!playerCountInput || !playerNamesContainer) return;

        function updatePlayerInputs() {
            const count = parseInt(playerCountInput.value);
            const existingValues = [];
            playerNamesContainer.querySelectorAll('.player-name-input').forEach(input => {
                existingValues.push(input.value);
            });

            playerNamesContainer.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = `Player ${i + 1}`;
                input.className = 'player-name-input form-input';
                if (i < existingValues.length) {
                    input.value = existingValues[i];
                }
                playerNamesContainer.appendChild(input);
            }
        }

        playerCountInput.addEventListener('change', updatePlayerInputs);
        updatePlayerInputs();
    }

    /**
     * Render new league form
     */
    function renderNewLeagueForm() {
        // Initialize player inputs
        const addPlayerBtn = document.getElementById('add-league-player-btn');
        const playerNamesContainer = document.getElementById('league-player-names');

        if (!addPlayerBtn || !playerNamesContainer) return;

        addPlayerBtn.addEventListener('click', () => {
            const count = playerNamesContainer.querySelectorAll('.player-name-input').length;
            const input = document.createElement('div');
            input.className = 'league-player-input-row';
            input.innerHTML = `
                <input type="text" placeholder="Player ${count + 1}" class="player-name-input form-input">
                <button type="button" class="btn btn-small btn-danger remove-player-btn">Remove</button>
            `;
            input.querySelector('.remove-player-btn').addEventListener('click', () => input.remove());
            playerNamesContainer.appendChild(input);
        });
    }

    // Public API
    return {
        showToast,
        showLoader,
        hideLoader,
        showModal,
        hideModal,
        showPage,
        renderRecentGames,
        renderStatsWidget,
        renderQuickStats,
        renderNewGameForm,
        renderScoreboard,
        renderDartInputs,
        renderCurrentPlayer,
        renderTurnHistory,
        renderGameHistory,
        renderGameDetail,
        renderLeaderboard,
        renderPlayerProfile,
        updateActiveGameUI,
        renderSpectatorGame,
        updateWinnersBoard,
        showLiveIndicator,
        getPaginationState: () => paginationState,
        renderStatsPage,
        renderPlayerStatsWidgets,
        openComparisonModal,
        closeComparisonModal,
        runPlayerComparison,
        // Competition functions
        renderCompetitionsHub,
        renderTournamentsList,
        renderLeaguesList,
        renderTournamentDetail,
        renderLeagueDetail,
        renderNewTournamentForm,
        renderNewLeagueForm,
        renderLeagueStandings,
        renderLeagueFixtures
    };
})();
