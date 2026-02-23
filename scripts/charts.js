/**
 * Charts Module
 * Provides chart rendering functionality using Chart.js
 * Themed to match Dart Bee's color scheme
 */

const Charts = (() => {
    // Theme colors from the app's design system (light mode defaults)
    const COLORS = {
        primary: '#7d5f92',
        primaryDark: '#573e69',
        primaryLight: '#9d7fb2',
        accentGreen: '#2de36d',
        accentYellow: '#facf39',
        accentBlue: '#38a2ff',
        accentRed: '#ff6b6b',
        textDark: '#2d2d2d',
        textLight: '#6b7280',
        background: '#f8f9fa',
        white: '#ffffff'
    };

    // Muted accent colors for dark mode (less eye strain)
    const DARK_COLORS = {
        primary: '#9d7fb2',
        primaryDark: '#7d5f92',
        primaryLight: '#b89fca',
        accentGreen: '#5ec987',
        accentYellow: '#d4b44a',
        accentBlue: '#6aa8d4',
        accentRed: '#d47e7e',
        textDark: '#d4d4d4',
        textLight: '#8892a4',
        background: '#1a1a2e',
        white: '#16213e'
    };

    // Get the right color set for current theme
    function C() {
        return isDarkMode() ? DARK_COLORS : COLORS;
    }

    // Chart color palette for multiple data series
    const CHART_PALETTE = [
        COLORS.primary,
        COLORS.accentGreen,
        COLORS.accentBlue,
        COLORS.accentYellow,
        COLORS.accentRed,
        COLORS.primaryLight,
        '#ff9f43',
        '#54a0ff'
    ];

    // Store chart instances for cleanup
    const chartInstances = {};

    // Detect dark mode for theme-dependent UI (grid, text, tooltips)
    function isDarkMode() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    /**
     * Get default chart options with consistent styling
     */
    function getDefaultOptions(type) {
        const dark = isDarkMode();
        const c = C();
        const textColor = c.textDark;
        const textMutedColor = c.textLight;
        const gridColor = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.05)';

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        font: {
                            family: 'Inter, sans-serif',
                            size: 12
                        },
                        color: textColor
                    }
                },
                tooltip: {
                    backgroundColor: COLORS.primaryDark,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    titleFont: {
                        family: 'Inter, sans-serif',
                        size: 13
                    },
                    bodyFont: {
                        family: 'Inter, sans-serif',
                        size: 12
                    },
                    padding: 10,
                    cornerRadius: 8
                }
            }
        };

        if (type === 'line' || type === 'bar') {
            baseOptions.scales = {
                x: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        },
                        color: textMutedColor
                    }
                },
                y: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        },
                        color: textMutedColor
                    }
                }
            };
        }

        return baseOptions;
    }

    /**
     * Destroy existing chart instance before creating new one
     */
    function destroyChart(chartId) {
        if (chartInstances[chartId]) {
            chartInstances[chartId].destroy();
            delete chartInstances[chartId];
        }
    }

    /**
     * Create Win/Loss Doughnut Chart
     * Shows wins vs losses in a clean doughnut format
     */
    function createWinLossChart(canvasId, wins, losses) {
        destroyChart(canvasId);
        const c = C();

        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        const total = wins + losses;

        if (total === 0) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = c.textLight;
            ctx.textAlign = 'center';
            ctx.fillText('No games played yet', canvas.width / 2, canvas.height / 2);
            return null;
        }

        const options = getDefaultOptions('doughnut');
        options.cutout = '65%';
        options.plugins.legend.position = 'bottom';
        options.plugins.tooltip.callbacks = {
            label: function(context) {
                const value = context.raw;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ${value} (${percentage}%)`;
            }
        };

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Wins', 'Losses'],
                datasets: [{
                    data: [wins, losses],
                    backgroundColor: [c.accentGreen, c.accentRed],
                    borderColor: [c.white, c.white],
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: options
        });

        return chartInstances[canvasId];
    }

    /**
     * Create Performance Over Time Line Chart
     * Shows avg per turn trend over recent games
     */
    function createPerformanceChart(canvasId, recentGames) {
        destroyChart(canvasId);
        const c = C();

        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        if (!recentGames || recentGames.length === 0) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = c.textLight;
            ctx.textAlign = 'center';
            ctx.fillText('No game history available', canvas.width / 2, canvas.height / 2);
            return null;
        }

        // Reverse to show chronological order (oldest first)
        const games = [...recentGames].reverse();
        const labels = games.map((g, i) => `Game ${i + 1}`);
        const avgPerTurn = games.map(g => g.turns > 0 ? (g.score / g.turns).toFixed(2) : 0);

        const options = getDefaultOptions('line');
        options.plugins.legend.display = false;
        options.scales.y.beginAtZero = true;
        options.scales.y.title = {
            display: true,
            text: 'Avg per Turn',
            font: { family: 'Inter, sans-serif', size: 11 },
            color: c.textLight
        };

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg per Turn',
                    data: avgPerTurn,
                    borderColor: c.primary,
                    backgroundColor: 'rgba(125, 95, 146, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: c.primary,
                    pointBorderColor: c.white,
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: options
        });

        return chartInstances[canvasId];
    }

    /**
     * Create Score Distribution Bar Chart
     * Shows distribution of turn scores (0-60, 60-100, 100-140, 140-180, 180)
     */
    function createScoreDistributionChart(canvasId, scoreData) {
        destroyChart(canvasId);
        const c = C();

        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        if (!scoreData || Object.values(scoreData).every(v => v === 0)) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = c.textLight;
            ctx.textAlign = 'center';
            ctx.fillText('No score data available', canvas.width / 2, canvas.height / 2);
            return null;
        }

        const labels = ['0-59', '60-99', '100-139', '140-179', '180'];
        const data = [
            scoreData.low || 0,
            scoreData.medium || 0,
            scoreData.good || 0,
            scoreData.high || 0,
            scoreData.perfect || 0
        ];

        const options = getDefaultOptions('bar');
        options.plugins.legend.display = false;
        options.scales.y.beginAtZero = true;
        options.scales.y.title = {
            display: true,
            text: 'Turn Count',
            font: { family: 'Inter, sans-serif', size: 11 },
            color: c.textLight
        };
        options.scales.x.title = {
            display: true,
            text: 'Turn Score Range',
            font: { family: 'Inter, sans-serif', size: 11 },
            color: c.textLight
        };

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Turns',
                    data: data,
                    backgroundColor: [
                        c.textLight,
                        c.accentBlue,
                        c.accentYellow,
                        c.primary,
                        c.accentGreen
                    ],
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: options
        });

        return chartInstances[canvasId];
    }

    /**
     * Create Head-to-Head Comparison Bar Chart
     */
    function createHeadToHeadChart(canvasId, headToHeadData) {
        destroyChart(canvasId);
        const c = C();

        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        if (!headToHeadData || Object.keys(headToHeadData).length === 0) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = c.textLight;
            ctx.textAlign = 'center';
            ctx.fillText('No head-to-head data', canvas.width / 2, canvas.height / 2);
            return null;
        }

        const opponents = Object.keys(headToHeadData).slice(0, 6); // Limit to top 6
        const wins = opponents.map(o => headToHeadData[o].wins);
        const losses = opponents.map(o => headToHeadData[o].losses);

        const options = getDefaultOptions('bar');
        options.plugins.legend.position = 'bottom';
        options.scales.y.beginAtZero = true;
        options.scales.y.stacked = true;
        options.scales.x.stacked = true;
        options.indexAxis = 'y';

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: opponents,
                datasets: [
                    {
                        label: 'Wins',
                        data: wins,
                        backgroundColor: c.accentGreen,
                        borderRadius: 4
                    },
                    {
                        label: 'Losses',
                        data: losses,
                        backgroundColor: c.accentRed,
                        borderRadius: 4
                    }
                ]
            },
            options: options
        });

        return chartInstances[canvasId];
    }

    /**
     * Create Leaderboard Comparison Chart
     * Horizontal bar chart comparing multiple players
     */
    function createLeaderboardChart(canvasId, leaderboardData, metric) {
        destroyChart(canvasId);
        const c = C();

        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        if (!leaderboardData || leaderboardData.length === 0) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = c.textLight;
            ctx.textAlign = 'center';
            ctx.fillText('No leaderboard data', canvas.width / 2, canvas.height / 2);
            return null;
        }

        const top5 = leaderboardData.slice(0, 5);
        const labels = top5.map(p => p.name);
        const values = top5.map(p => parseFloat(p.metric) || 0);

        const metricLabels = {
            'wins': 'Total Wins',
            'win-rate': 'Win Rate (%)',
            'avg-turn': 'Avg per Turn',
            '100s': 'Total 100+'
        };

        const options = getDefaultOptions('bar');
        options.indexAxis = 'y';
        options.plugins.legend.display = false;
        options.scales.x.beginAtZero = true;
        options.scales.x.title = {
            display: true,
            text: metricLabels[metric] || 'Value',
            font: { family: 'Inter, sans-serif', size: 11 },
            color: c.textLight
        };

        // Use gradient colors based on rank
        const dark = isDarkMode();
        const backgroundColors = top5.map((_, i) => {
            const opacity = 1 - (i * 0.15);
            return dark
                ? `rgba(157, 127, 178, ${opacity})`
                : `rgba(125, 95, 146, ${opacity})`;
        });

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: backgroundColors,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: options
        });

        return chartInstances[canvasId];
    }

    /**
     * Create Radar Chart for player stats overview
     */
    function createStatsRadarChart(canvasId, stats) {
        destroyChart(canvasId);
        const c = C();

        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        if (!stats) {
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = c.textLight;
            ctx.textAlign = 'center';
            ctx.fillText('No stats available', canvas.width / 2, canvas.height / 2);
            return null;
        }

        // Normalize stats to 0-100 scale for radar chart
        const normalizeValue = (value, max) => Math.min((value / max) * 100, 100);

        const data = [
            normalizeValue(parseFloat(stats.winRate) || 0, 100),
            normalizeValue(parseFloat(stats.avgPerTurn || stats.avgPerDart) || 0, 60),
            normalizeValue(stats.total100s || 0, 20),
            normalizeValue(stats.maxTurn || 0, 180),
            normalizeValue(parseFloat(stats.checkoutPercentage) || 0, 100)
        ];

        const dark = isDarkMode();
        const gridColor = dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: c.primaryDark,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    callbacks: {
                        label: function(context) {
                            const labels = ['Win Rate', 'Avg/Turn', '100+', 'Max Turn', 'Checkout %'];
                            const rawValues = [
                                `${stats.winRate}%`,
                                stats.avgPerTurn || stats.avgPerDart,
                                stats.total100s,
                                stats.maxTurn,
                                `${stats.checkoutPercentage}%`
                            ];
                            return `${labels[context.dataIndex]}: ${rawValues[context.dataIndex]}`;
                        }
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        display: false
                    },
                    grid: {
                        color: gridColor
                    },
                    angleLines: {
                        color: gridColor
                    },
                    pointLabels: {
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        },
                        color: c.textDark
                    }
                }
            }
        };

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Win Rate', 'Avg/Turn', '100+', 'Max Turn', 'Checkout %'],
                datasets: [{
                    data: data,
                    backgroundColor: 'rgba(125, 95, 146, 0.2)',
                    borderColor: c.primary,
                    borderWidth: 2,
                    pointBackgroundColor: c.primary,
                    pointBorderColor: c.white,
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: options
        });

        return chartInstances[canvasId];
    }

    /**
     * Destroy all chart instances (cleanup)
     */
    function destroyAllCharts() {
        Object.keys(chartInstances).forEach(id => {
            destroyChart(id);
        });
    }

    // Public API
    return {
        createWinLossChart,
        createPerformanceChart,
        createScoreDistributionChart,
        createHeadToHeadChart,
        createLeaderboardChart,
        createStatsRadarChart,
        destroyChart,
        destroyAllCharts,
        COLORS
    };
})();
