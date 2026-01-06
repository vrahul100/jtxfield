# AIField - Complete Supabase Setup Guide

This guide covers setting up a fresh AIField instance on Supabase from scratch.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- A Supabase project created at [supabase.com](https://supabase.com)
- Node.js 18+ installed
- A Groq API key from [console.groq.com](https://console.groq.com)

## 1. Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Note your **Project Reference ID** (e.g., `gevdamoroboqxpacbdkk`)

## 2. Get Connection Details

From **Settings → Database**:
```
DATABASE_URL=postgres://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

From **Settings → API**:
- **Project URL** → `SUPABASE_URL`
- **service_role key** → `SUPABASE_SERVICE_KEY`

## 3. Configure Environment

Create `.env` in project root:
```bash
# App
PORT=3000
NODE_ENV=development
DEPLOY_MODE=remote  # 'local' or 'remote'

# Supabase
DATABASE_URL=postgres://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_SERVICE_KEY=eyJ...your_service_role_key

# Storage
SUPABASE_STORAGE_BUCKET=media

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1...

# AI
GROQ_API_KEY=gsk_...
```

## 4. Run Database Migrations

Run ALL migrations in order:

```bash
# Install dependencies
npm install

# Core schema (nodes, members, buckets, projects, txns, users)
npx tsx scripts/sync-supabase-schema.ts

# Sessions table (for authentication)
npx tsx scripts/create-sessions.ts

# Seed test data (optional)
npx tsx scripts/seed-test-data.ts
```

## 5. Create Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Click **New bucket**
3. Name: `media`
4. Toggle **Public bucket** = ON

## 6. Setup Edge Function

### Link to your project:
```bash
supabase link --project-ref [YOUR_PROJECT_REF]
```

### Set secrets:
```bash
supabase secrets set GROQ_API_KEY=gsk_YOUR_ACTUAL_KEY --project-ref [PROJECT_REF]
```

### Setup the Postgres trigger:
```bash
npx tsx scripts/create-bucket-trigger.ts
```

### Deploy the Edge Function:
```bash
supabase functions deploy process-bucket --no-verify-jwt --project-ref [PROJECT_REF]
```

## 7. Verify Setup

### Test database connection:
```bash
npm run dev
```

### Run webhook tests:
```bash
npm run test:webhook:persist
```

### Debug trigger:
```bash
npx tsx scripts/debug-trigger.ts
```

## 8. Configure Twilio Webhook

Set your Twilio WhatsApp/SMS webhook URL to:
```
https://[YOUR_VERCEL_URL]/twhook
```

---

## Migration Reference

### Core Migrations (in order)
| File | Purpose |
|------|---------|
| `drizzle/0000_careless_centennial.sql` | Core schema (nodes, members, txns) |
| `drizzle/0001_lonely_triton.sql` | Users, buckets enhancements |
| `drizzle/run-migration.ts` | Adds domain, projects, bucket columns |
| `scripts/create-sessions.ts` | Sessions table for auth |

### Column Migrations
| File | Purpose |
|------|---------|
| `0003_add_pending_node_id.sql` | pending_node_id on members |
| `0004_add_conversation_history.sql` | conversation_history JSONB on buckets |
| `0005_simplify_txns.sql` | Simplified txns schema |
| `0006_add_extracted_data.sql` | extracted_data JSONB on buckets |
| `0007_add_clarity_score.sql` | clarity_score on buckets |
| `0008_add_summary.sql` | summary text on buckets |

### Utility Scripts
| Script | Purpose |
|--------|---------|
| `scripts/sync-supabase-schema.ts` | Runs ALL migrations at once |
| `scripts/seed-test-data.ts` | Creates test users and members |
| `scripts/create-bucket-trigger.ts` | Sets up pg_net trigger |
| `scripts/debug-trigger.ts` | Debugs trigger and pg_net |
| `scripts/reset-db.ts` | ⚠️ Deletes all data |

---

## Complete Fresh Setup (One Command)

For a fresh project, run these in order:

```bash
# 1. Configure .env with Supabase credentials

# 2. Run all migrations
npx tsx scripts/sync-supabase-schema.ts
npx tsx scripts/create-sessions.ts
npx tsx drizzle/run-migration.ts

# 3. Seed data
npx tsx scripts/seed-test-data.ts

# 4. Setup Edge Function
supabase link --project-ref [PROJECT_REF]
supabase secrets set GROQ_API_KEY=gsk_YOUR_KEY --project-ref [PROJECT_REF]
npx tsx scripts/create-bucket-trigger.ts
supabase functions deploy process-bucket --no-verify-jwt --project-ref [PROJECT_REF]

# 5. Start dev server
npm run dev
```

---

## Test Credentials (After Seeding)

| Role | Email | Password |
|------|-------|----------|
| Super User | admin@jtxfield.com | admin123 |
| Office Manager #1 | manager1@downtown.com | manager123 |
| Office Manager #2 | manager2@westside.com | manager123 |

Test Workers: +15551234567, +15551234568, +15559876543
