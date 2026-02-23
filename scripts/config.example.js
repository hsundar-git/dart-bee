/**
 * Dart Bee - Configuration Template
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a Supabase account at https://supabase.com
 * 2. Create a new project (free tier)
 * 3. In your project, go to Settings → API
 * 4. Copy your Project URL and Anon Public Key
 * 5. Create scripts/config.js from this template
 * 6. Paste your credentials below
 * 7. Run the SQL schema from supabase-schema.sql in your Supabase SQL Editor
 *
 * NOTE: Do NOT commit scripts/config.js to git (it's in .gitignore)
 * This file contains your API credentials
 */

const AppConfig = {
    supabase: {
        // Your Supabase project URL (format: https://your-project.supabase.co)
        url: 'https://YOUR_PROJECT.supabase.co',

        // Your Supabase anonymous (public) key
        // NOT your service_role key!
        anonKey: 'YOUR_ANON_KEY_HERE'
    },

    // Storage backend: 'supabase' (default) or 'local' (localStorage fallback)
    // Set to 'local' to run fully offline without a Supabase backend.
    // If omitted or set to 'supabase', the app will auto-fallback to 'local'
    // when Supabase credentials are missing or the connection fails.
    storage: 'supabase'
};
