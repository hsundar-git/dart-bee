/**
 * Sync from Supabase to Local Storage
 *
 * Run this from the browser console or include it temporarily to pull
 * all data from the Supabase database into localStorage.
 *
 * Usage (browser console):
 *   await SyncFromSupabase.run()
 *
 * Or with custom credentials:
 *   await SyncFromSupabase.run('https://your-project.supabase.co', 'your-anon-key')
 */

const SyncFromSupabase = (() => {

    async function fetchAll(sb, table, orderCol) {
        const PAGE_SIZE = 1000;
        let allData = [];
        let offset = 0;
        while (true) {
            let query = sb.from(table).select('*').range(offset, offset + PAGE_SIZE - 1);
            if (orderCol) query = query.order(orderCol);
            const { data, error } = await query;
            if (error) throw new Error(`${table}: ${error.message}`);
            allData = allData.concat(data || []);
            if (!data || data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }
        return allData;
    }

    async function run(url, anonKey) {
        // Use config credentials if not provided
        if (!url || !anonKey) {
            if (typeof AppConfig === 'undefined' || !AppConfig.supabase) {
                console.error('No Supabase config found. Pass url and anonKey as arguments.');
                return false;
            }
            url = AppConfig.supabase.url;
            anonKey = AppConfig.supabase.anonKey;
        }

        console.log('🔄 Connecting to Supabase...');
        console.log(`   URL: ${url}`);

        // Create a temporary Supabase client
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase JS library not loaded. Make sure the CDN script is included.');
            return false;
        }

        const sb = window.supabase.createClient(url, anonKey);

        try {
            // Test connection
            const { error: testErr } = await sb.from('games').select('id').limit(1);
            if (testErr) {
                console.error('Connection failed:', testErr.message);
                return false;
            }
            console.log('✓ Connected to Supabase');

            // Fetch all tables
            console.log('📥 Fetching data...');

            const [games, players, gamePlayers, turns] = await Promise.all([
                fetchAll(sb, 'games', 'created_at'),
                fetchAll(sb, 'players', 'name'),
                fetchAll(sb, 'game_players', null),
                fetchAll(sb, 'turns', 'turn_number')
            ]);

            console.log(`   Games: ${games.length}`);
            console.log(`   Players: ${players.length}`);
            console.log(`   Game Players: ${gamePlayers.length}`);
            console.log(`   Turns: ${turns.length}`);

            // Confirm before overwriting
            const existingGames = LocalDB.getTable('games');
            if (existingGames.length > 0) {
                console.warn(`⚠️  Local storage has ${existingGames.length} games. These will be REPLACED.`);
            }

            // Write to LocalDB
            console.log('💾 Writing to local storage...');
            LocalDB.setTable('games', games);
            LocalDB.setTable('players', players);
            LocalDB.setTable('game_players', gamePlayers);
            LocalDB.setTable('turns', turns);

            // Verify
            const verify = {
                games: LocalDB.getTable('games').length,
                players: LocalDB.getTable('players').length,
                game_players: LocalDB.getTable('game_players').length,
                turns: LocalDB.getTable('turns').length
            };

            console.log('✓ Data written to local storage:');
            console.log(`   Games: ${verify.games}`);
            console.log(`   Players: ${verify.players}`);
            console.log(`   Game Players: ${verify.game_players}`);
            console.log(`   Turns: ${verify.turns}`);

            // Recompute player aggregates from game_players data
            console.log('📊 Recomputing player aggregates...');
            if (typeof LocalStorageBackend !== 'undefined' && LocalStorageBackend.recomputeAllPlayerAggregates) {
                LocalStorageBackend.recomputeAllPlayerAggregates();
            } else {
                console.warn('LocalStorageBackend not available — refresh the page to recompute stats');
            }

            console.log('');
            console.log('✅ Sync complete! Refresh the page to see the data.');

            return true;
        } catch (error) {
            console.error('❌ Sync failed:', error.message);
            return false;
        }
    }

    return { run };
})();
