/**
 * Supabase Client Module
 * Initializes and manages Supabase connection
 */

const SupabaseClient = (() => {
    let supabaseInstance = null;
    let connectionStatus = 'disconnected';

    /**
     * Initialize Supabase client
     */
    function init() {
        try {
            // If storage is explicitly set to 'local', skip Supabase init
            if (typeof AppConfig !== 'undefined' && AppConfig.storage === 'local') {
                console.log('Storage mode is "local" — skipping Supabase init');
                connectionStatus = 'skipped';
                return false;
            }

            if (typeof AppConfig === 'undefined') {
                console.warn('scripts/config.js not found — will fall back to local storage');
                connectionStatus = 'error';
                return false;
            }

            if (!AppConfig.supabase) {
                console.warn('No supabase config — will fall back to local storage');
                connectionStatus = 'error';
                return false;
            }

            const { url, anonKey } = AppConfig.supabase;

            if (!url || !anonKey || url.includes('YOUR_PROJECT')) {
                console.warn('Supabase credentials not configured — will fall back to local storage');
                connectionStatus = 'error';
                return false;
            }

            if (typeof window.supabase === 'undefined') {
                console.warn('Supabase JS library not loaded — will fall back to local storage');
                connectionStatus = 'error';
                return false;
            }

            supabaseInstance = window.supabase.createClient(url, anonKey);
            connectionStatus = 'connected';

            console.log('✓ Supabase client initialized successfully');
            return true;
        } catch (error) {
            console.warn('Failed to initialize Supabase (will fall back to local):', error.message);
            connectionStatus = 'error';
            return false;
        }
    }

    /**
     * Get Supabase client instance
     */
    function getClient() {
        if (!supabaseInstance) {
            throw new Error('Supabase client not initialized. Call SupabaseClient.init() first.');
        }
        return supabaseInstance;
    }

    /**
     * Check if connected to Supabase
     */
    function isConnected() {
        return connectionStatus === 'connected' && supabaseInstance !== null;
    }

    /**
     * Get connection status
     */
    function getStatus() {
        return connectionStatus;
    }

    /**
     * Test connection to Supabase
     */
    async function testConnection() {
        try {
            const { data, error } = await getClient()
                .from('games')
                .select('id')
                .limit(1);

            if (error) {
                console.error('Connection test failed:', error);
                connectionStatus = 'error';
                return false;
            }

            connectionStatus = 'connected';
            console.log('✓ Supabase connection verified');
            return true;
        } catch (error) {
            console.error('Connection test error:', error);
            connectionStatus = 'error';
            return false;
        }
    }

    /**
     * Unsubscribe from a channel
     */
    function unsubscribe(channel) {
        if (supabaseInstance && channel) {
            supabaseInstance.removeChannel(channel);
        }
    }

    // Public API
    return {
        init,
        getClient,
        isConnected,
        getStatus,
        testConnection,
        unsubscribe
    };
})();

/**
 * Initialize Supabase immediately after config is loaded
 * This runs before other scripts that need the client
 */
if (typeof AppConfig !== 'undefined') {
    SupabaseClient.init();
} else {
    // Fallback: try during DOMContentLoaded if config wasn't loaded yet
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof AppConfig !== 'undefined' && !SupabaseClient.isConnected()) {
            SupabaseClient.init();
        }
    });
}
