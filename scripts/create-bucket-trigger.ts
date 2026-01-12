#!/usr/bin/env npx tsx

/**
 * Create Supabase database trigger for bucket processing
 * Sets up pg_net extension and trigger to call Edge Function
 * when bucket status changes to 'pending_processing'
 * Requires: SUPABASE_SERVICE_KEY in .env
 * Usage: npx tsx scripts/create-bucket-trigger.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}

// Get Supabase config from .env
const SUPABASE_PROJECT_REF = process.env.SUPABASE_URL?.match(/https:\/\/(.+?)\.supabase\.co/)?.[1] || '[PROJECT_REF]';
const EDGE_FUNCTION_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/process-bucket`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SERVICE_KEY || SERVICE_KEY === 'eyJ...') {
    console.error('❌ Please set SUPABASE_SERVICE_KEY in your .env file first');
    process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: 'require' });

async function migrate() {
    console.log('🚀 Setting up Supabase trigger for bucket processing...');
    console.log(`   Edge Function URL: ${EDGE_FUNCTION_URL}`);

    try {
        // 1. Enable pg_net extension
        console.log('  - Enabling pg_net extension...');
        await sql`CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;`;

        // 2. Create the trigger function using EXACT Supabase documentation syntax
        console.log('  - Creating trigger function...');
        await sql.unsafe(`
            CREATE OR REPLACE FUNCTION notify_bucket_processing()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Use exact syntax from Supabase pg_net documentation
                PERFORM "net"."http_post"(
                    url:='${EDGE_FUNCTION_URL}'::text,
                    body:=jsonb_build_object('bucketId', NEW.id),
                    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${SERVICE_KEY}"}'::jsonb
                );
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER;
        `);

        // 3. Create the trigger
        console.log('  - Creating trigger on buckets table...');
        await sql.unsafe(`
            DROP TRIGGER IF EXISTS process_bucket_trigger ON buckets;
            
            -- Trigger on UPDATE (when status changes TO pending_processing)
            CREATE TRIGGER process_bucket_trigger
            AFTER UPDATE ON buckets
            FOR EACH ROW
            WHEN (NEW.status = 'pending_processing' AND OLD.status IS DISTINCT FROM 'pending_processing')
            EXECUTE FUNCTION notify_bucket_processing();
            
            -- Also trigger on INSERT if bucket is created with pending_processing status
            DROP TRIGGER IF EXISTS process_bucket_insert_trigger ON buckets;
            CREATE TRIGGER process_bucket_insert_trigger
            AFTER INSERT ON buckets
            FOR EACH ROW
            WHEN (NEW.status = 'pending_processing')
            EXECUTE FUNCTION notify_bucket_processing();
        `);

        console.log('✅ Trigger setup complete!');
        console.log('');
        console.log('The trigger will call your Edge Function when a bucket status changes to "pending_processing".');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await sql.end();
    }
}

migrate();
