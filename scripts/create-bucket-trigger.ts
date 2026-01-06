import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function migrate() {
    console.log('🚀 Setting up Supabase trigger for bucket processing...');

    try {
        // 1. Enable pg_net extension (for HTTP calls)
        console.log('  - Enabling pg_net extension...');
        await sql`CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;`;

        // 2. Create the trigger function
        console.log('  - Creating trigger function...');
        await sql.unsafe(`
            CREATE OR REPLACE FUNCTION notify_bucket_processing()
            RETURNS TRIGGER AS $$
            DECLARE
                edge_function_url TEXT := current_setting('app.edge_function_url', true);
                service_key TEXT := current_setting('app.supabase_service_key', true);
            BEGIN
                -- Call the Supabase Edge Function via pg_net
                PERFORM extensions.http_post(
                    url := edge_function_url || '/process-bucket',
                    body := json_build_object('bucketId', NEW.id)::text,
                    headers := json_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || service_key
                    )::jsonb
                );
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER;
        `);

        // 3. Create the trigger
        console.log('  - Creating trigger on buckets table...');
        await sql.unsafe(`
            DROP TRIGGER IF EXISTS process_bucket_trigger ON buckets;
            
            CREATE TRIGGER process_bucket_trigger
            AFTER UPDATE ON buckets
            FOR EACH ROW
            WHEN (NEW.status = 'pending_processing' AND OLD.status IS DISTINCT FROM 'pending_processing')
            EXECUTE FUNCTION notify_bucket_processing();
        `);

        console.log('✅ Trigger setup complete!');
        console.log('');
        console.log('⚠️  IMPORTANT: Set these in your Supabase Dashboard > Settings > Database > Connection Pooling > Custom Config:');
        console.log('   app.edge_function_url = https://[PROJECT_REF].supabase.co/functions/v1');
        console.log('   app.supabase_service_key = [YOUR_SERVICE_ROLE_KEY]');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await sql.end();
    }
}

migrate();
