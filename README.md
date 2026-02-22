# Dart Bee - Game Score Manager

A modern, responsive web app for tracking dart games with detailed statistics and leaderboards. Built with vanilla HTML, CSS, and JavaScript for fast, offline-capable gameplay.

## Features

### Game Management
- **Create New Games**: Set number of players, custom names, starting points (101-1001), and win conditions
- **Active Game Scoring**: Enter darts per turn with quick number pad for common scores
- **Two Scoring Modes**:
  - Per-dart entry (3 inputs) - recommended for detailed statistics
  - Per-turn total - faster gameplay
- **Game History**: Browse, search, and view detailed game records
- **Resume Games**: Automatically resume interrupted games

### Statistics & Analytics
- **Player Profiles**: Comprehensive individual statistics
  - Games played/won, win rate
  - Average per dart, per turn
  - Highest scores (180s, 140+s)
  - Checkout percentage
  - Max dart and max turn scores
- **Head-to-Head Records**: Track records against specific opponents
- **Leaderboards**: Multiple ranking options
  - Most wins
  - Best win rate
  - Highest average per dart
  - Most 180s
- **Time Filters**: All-time, last 30 days, last 7 days

### User Experience
- **Nudge Bee Design**: Modern purple theme matching Nudge Bee aesthetic
- **Responsive Design**: Mobile-first approach, optimized for phones and tablets
- **Progressive Web App**: PWA with installable support
- **Data Persistence**: All data stored in Supabase (PostgreSQL)
- **Auto-save**: Automatic save after each turn
- **Toast Notifications**: Real-time feedback on actions

## Getting Started

### Prerequisites

- A [Supabase](https://supabase.com) account and project (free tier works)
- Python 3 or Node.js (for local dev server)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dart-bee.git
   cd dart-bee
   ```

2. **Set up Supabase**
   - Create a Supabase project at https://supabase.com
   - Go to **Settings → API** and copy your **Project URL** and **Anon Public Key**
   - Copy the config template and add your credentials:
     ```bash
     cp scripts/config.example.js scripts/config.js
     ```
   - Edit `scripts/config.js` and paste your URL and anon key

3. **Run database migrations**
   - In the Supabase SQL Editor (or via `psql`), run the migration files in `migrations/` **in sequential order** (V001 through V018)
   - See `migrations/README.md` for detailed instructions

4. **Start local development server**
   ```bash
   # Using Python
   python -m http.server 8000

   # Or using Node.js
   npx http-server
   ```
   Then visit http://localhost:8000

5. **Enable GitHub Pages** (for deployment)
   - Go to repository Settings → Pages
   - Select "main" branch as source
   - Your app will be available at `https://yourusername.github.io/dart-bee`

### First Use

1. Click "Start New Game" on the home page
2. Select number of players and optionally enter their names
3. Choose starting points (default: 501)
4. Choose win condition (exact zero or zero/below)
5. Select scoring mode (per-dart recommended)
6. Click "Start Playing"
7. Enter dart scores and submit turns
8. Game ends when a player reaches zero

## Usage Guide

### Creating a Game
- **Number of Players**: 1-8 players
- **Player Names**: Optional (auto-generates if blank)
- **Starting Points**: 101, 201, 301, 501, 701, 1001, or custom
- **Win Condition**:
  - Exact zero (standard darts rules)
  - Zero or below (game ends at or below zero)
- **Scoring Mode**: Per-dart (recommended) or per-turn total

### During Gameplay
- **Dart Entry**: Click numbers or use number pad
- **Quick Buttons**: Common dart scores for fast entry (20, 25, 30, 40, 50, 60, 80, 100, 120, 140, 160, 180)
- **Undo**: Remove last turn if needed
- **Turn History**: View all turns in current game
- **Bust Detection**: Automatic handling of invalid turns

### Viewing Statistics
- **Home**: Quick overview of your stats and recent games
- **Leaderboard**: Rankings by wins, win rate, average, or 180s
- **Player Profile**: Detailed stats, records, and head-to-head data
- **Game History**: Search and view detailed turn-by-turn breakdowns

## Architecture

### File Structure
```
dart-bee/
├── index.html              # Main app entry point
├── manifest.json           # PWA configuration
├── README.md               # This file
├── styles/
│   ├── main.css            # Design system and global styles
│   ├── components.css      # Component-specific styles
│   └── bee-theme.css       # Theme enhancements
├── scripts/
│   ├── config.example.js   # Supabase config template
│   ├── config.js           # Supabase credentials (gitignored)
│   ├── storage.js          # Supabase database operations
│   ├── game.js             # Game logic and scoring
│   ├── stats.js            # Statistics calculations
│   ├── ui.js               # DOM rendering
│   ├── app.js              # Routing and event handlers
│   ├── router.js           # Hash-based SPA routing
│   ├── tournament.js       # Tournament management
│   ├── league.js           # League management
│   ├── charts.js           # Chart.js visualizations
│   └── statsWidgets.js     # Statistics widgets
└── migrations/             # SQL migrations (V001-V018)
```

### Key Modules

#### Storage (`storage.js`)
- Supabase client wrapper for all database CRUD operations
- Normalized schema queries (games, players, game_players, turns)
- Real-time subscriptions for live game updates
- Player profile management

#### Game (`game.js`)
- Game creation and initialization
- Turn submission and validation
- Bust detection
- Score calculation
- Winner determination

#### Stats (`stats.js`)
- Player statistics calculation
- Leaderboard generation
- Head-to-head records
- Time-based filtering

#### UI (`ui.js`)
- Page rendering and updates
- Form handling
- Toast notifications
- Modal dialogs

#### App (`app.js`)
- Application routing
- Event listeners
- Game state management
- Page navigation

## Data Model (Normalized PostgreSQL Schema)

### `players` table
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Unique player name |
| total_games_played | INTEGER | Aggregate games played |
| total_games_won | INTEGER | Aggregate games won |
| total_darts_thrown | INTEGER | Aggregate darts thrown |
| total_score | INTEGER | Aggregate score |
| total_180s | INTEGER | Total 180 scores |
| total_140_plus | INTEGER | Total 140+ scores |
| best_checkout | INTEGER | Best checkout score |

### `games` table
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| game_type | INTEGER | Target score (101, 301, 501, etc.) |
| win_condition | TEXT | 'exact' or 'below' |
| scoring_mode | TEXT | 'per-dart' or 'per-turn' |
| is_active | BOOLEAN | Whether game is in progress |
| winner_id | UUID | FK to players |
| device_id | TEXT | Device that created the game |

### `game_players` table (junction)
| Column | Type | Description |
|--------|------|-------------|
| game_id | UUID | FK to games |
| player_id | UUID | FK to players |
| player_order | INTEGER | Turn order (0-based) |
| starting_score | INTEGER | Starting score for this game |
| is_winner | BOOLEAN | Whether player won |
| total_turns/darts/score | INTEGER | Per-game stats |

### `turns` table
| Column | Type | Description |
|--------|------|-------------|
| game_player_id | UUID | FK to game_players |
| turn_number | INTEGER | Turn number for this player |
| dart_scores | INTEGER[] | Array of dart scores |
| score_before/after | INTEGER | Score before and after turn |
| is_busted | BOOLEAN | Whether turn was a bust |

## Design System

### Color Palette (Nudge Bee Theme)
- **Primary Dark**: #573e69
- **Primary**: #7d5f92
- **Primary Light**: #9d7fb2
- **Accent Green**: #2de36d
- **Accent Yellow**: #facf39
- **Accent Blue**: #38a2ff
- **Background**: #fbf5ff
- **Text Dark**: #271f36
- **Text Light**: #6b5b7a

### Typography
- **Font Family**: Inter (Google Fonts)
- **Sizes**: XS (12px) to 3XL (40px)
- **Weights**: Regular (400) to Extra Bold (800)

## Performance

- **No Build Step**: Run directly in browser
- **Fast Loading**: ~15KB gzipped
- **Real-time**: Live game updates via Supabase subscriptions
- **Lazy Statistics**: Calculated on demand via materialized views
- **Auto-save**: Every 30 seconds
- **Responsive**: Mobile-optimized

## Browser Support

- Chrome/Chromium: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Edge: Latest 2 versions

## Technical Details

### Database
- Supabase (hosted PostgreSQL) backend
- Normalized schema with 4 core tables: `games`, `players`, `game_players`, `turns`
- Materialized views for fast leaderboard queries
- Database triggers for auto-updating aggregate stats
- Real-time subscriptions for spectator mode

### Performance Considerations
- Materialized views for O(1) leaderboard lookups
- Indexed queries for game history
- Debounced search inputs
- Minimal DOM manipulation

## Future Enhancements

- [ ] Settings page (notifications, themes, data management)
- [ ] Player avatars and profiles
- [ ] Social sharing (scores, achievements)
- [ ] Team/league management
- [ ] Mobile app version (React Native)
- [ ] Cloud sync (Firebase/Supabase)
- [ ] Match statistics (leg analysis)
- [ ] Replay game feature
- [ ] Achievements/badges system
- [ ] Advanced filtering and search
- [ ] Custom tournaments
- [ ] Live multiplayer scoring

## Development

### Running Locally
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Then visit http://localhost:8000
```

### Code Organization
- Modular IIFE (Immediately Invoked Function Expression) pattern
- Vanilla JavaScript (no framework)
- External dependencies: Supabase JS client, Chart.js (both loaded via CDN)
- CSS Grid and Flexbox layouts

### Adding Features
1. Update data model if needed (Game/Player objects)
2. Add logic to appropriate module (game.js, stats.js, etc.)
3. Add UI rendering to ui.js
4. Add event listeners to app.js
5. Test across different screen sizes

## Testing

### Manual Testing Checklist
- [ ] Create game with 1-8 players
- [ ] Submit turns and validate score calculations
- [ ] Test bust detection
- [ ] Verify undo functionality
- [ ] Check game history filtering
- [ ] Test leaderboard sorting/filtering
- [ ] View player profiles and stats
- [ ] Test on mobile devices
- [ ] Test offline functionality
- [ ] Verify data persistence

### Edge Cases
- Game with 1 player
- Custom point values
- Undo on first turn
- Resume interrupted game
- Large number of games (performance)

## Troubleshooting

### Data Not Saving
- Check that `scripts/config.js` has valid Supabase credentials
- Open browser DevTools console and look for connection errors
- Verify your Supabase project is active and migrations have been run

### Game Not Resuming
- Manually navigate to home, then back to game
- Check browser console for database errors

### Stats Not Updating
- Materialized views may need refreshing — run `SELECT refresh_player_leaderboard();` in Supabase SQL Editor
- Reload the leaderboard page

## License

MIT License - Feel free to use, modify, and distribute

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

- Report issues on GitHub Issues
- Check existing issues first
- Include browser/device info and steps to reproduce

## Credits

Designed with the Nudge Bee aesthetic by [Nudge Bee](https://nudgebee.com/)

---

Built with ❤️ for dart enthusiasts
