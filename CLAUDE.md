# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dart Bee is a Progressive Web App for tracking dart games with statistics and leaderboards. Built with vanilla JavaScript (no framework), HTML5, and CSS3. Uses Supabase (PostgreSQL) for backend with real-time updates.

## Development Commands

```bash
# Start local development server (no build step required)
python -m http.server 8000
# or
npx http-server

# Run database migrations
cd migrations && ./run_migration.sh
```

## Architecture

**Module Pattern:** All JavaScript modules use IIFE (Immediately Invoked Function Expression) pattern with private scope and public API:

```javascript
const ModuleName = (() => {
    function privateFunction() { }
    return { publicMethod };
})();
```

**Core Modules (scripts/):**
- `app.js` - Main orchestrator: routing, state management, real-time subscriptions, spectator mode
- `ui.js` - All DOM rendering and component generation
- `storage.js` - Supabase integration, all database CRUD operations
- `game.js` - Game logic: turn validation, scoring, bust detection
- `stats.js` - Statistics calculations, leaderboards, head-to-head records
- `router.js` - Hash-based SPA routing (#/)
- `tournament.js` / `league.js` - Competition management
- `charts.js` / `statsWidgets.js` - Chart.js visualizations

**Data Flow:**
1. Router detects hash change → App.handleRoute()
2. App loads page data via Storage module (Supabase queries)
3. UI module renders the page
4. Game/Stats modules handle business logic
5. Real-time subscriptions update UI for live games

**Database Schema (normalized):**
- `games` - Game metadata (type, win_condition, scoring_mode, is_active)
- `players` - Player profiles with aggregate stats
- `game_players` - Junction table linking players to games
- `turns` - Individual turn data (darts, scores, timestamps)

## Key Concepts

- **Device ID:** Unique browser identifier distinguishes active players from spectators
- **Spectator Mode:** View live games from other devices via real-time Supabase subscriptions
- **Scoring Modes:** Per-dart (detailed) vs per-turn (fast entry)
- **Auto-save:** Games saved every 30 seconds

## Routes

`#/` home, `#/new-game`, `#/game/:id`, `#/history`, `#/history/game/:id`, `#/leaderboard`, `#/leaderboard/player/:name`, `#/competitions`, `#/tournament/*`, `#/league/*`, `#/stats`

## Configuration

Copy `scripts/config.example.js` to `scripts/config.js` and add Supabase credentials. Database migrations in `migrations/` directory (V001-V017).

## Styling

Three CSS files in `styles/`: `main.css` (design system), `components.css` (all components), `bee-theme.css` (theme enhancements). Purple color palette (#573e69 to #9d7fb2).
