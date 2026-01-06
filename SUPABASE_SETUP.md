# JTX Field: Supabase Setup Guide

## 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon/service_role keys** from Settings > API.
3. Get your **Database Connection String** from Settings > Database.

## 2. Database Migrations
Run these from your local machine:
```bash
DATABASE_URL=[YOUR_CONNECTION_STRING] npx tsx scripts/create-sessions.ts
```

## 3. Create Storage Bucket
In your Supabase Dashboard:
1. Go to **Storage** > **New Bucket**.
2. Name it `media` (or your preferred name).
3. Set it to **Public** if you want direct image URLs, or **Private** for signed URLs.

## 4. Environment Variables
Add these to your `.env` file:
```bash
DATABASE_URL=postgres://...@db.[PROJECT_REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # service_role key (for server-side storage access)
SUPABASE_STORAGE_BUCKET=media
```

## 5. Deploy Edge Functions (Optional)
If using Supabase Edge Functions for webhooks:
```bash
supabase functions deploy process-bucket
```

## 6. Local Development
For local dev, the existing `npm run dev` works unchanged. Media will use Twilio URLs directly until copied by the worker.

## 7. Set Up the Processing Trigger
Run this migration to enable the Postgres trigger:
```bash
npx tsx scripts/create-bucket-trigger.ts
```

Then in your Supabase Dashboard, go to **Settings > Database > Configuration** and add:
- `app.edge_function_url` = `https://[PROJECT_REF].supabase.co/functions/v1`
- `app.supabase_service_key` = Your service_role key

## 8. Deploy the Edge Function
```bash
supabase functions deploy process-bucket
```

The function will be called automatically when a bucket's status changes to `pending_processing`.
