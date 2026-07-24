#!/usr/bin/env npx tsx

/**
 * Task automation script for Dev and Prod workflows
 * Usage:
 *   npx tsx scripts/deploy.ts dev   (Syncs .env.dev, deploys DEV edge function, launches local dev server)
 *   npx tsx scripts/deploy.ts prod  (Syncs .env.prod, builds API+UI, deploys PROD edge function, deploys Vercel --prod)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const target = process.argv[2]?.toLowerCase();

if (!target || !['dev', 'prod'].includes(target)) {
    console.error('❌ Please specify target environment: "dev" or "prod"');
    console.error('Usage: npm run start:dev  OR  npm run deploy:prod');
    process.exit(1);
}

const envFile = `.env.${target}`;
const projectRoot = process.cwd();
const targetEnvPath = path.join(projectRoot, envFile);
const activeEnvPath = path.join(projectRoot, '.env');

if (!fs.existsSync(targetEnvPath)) {
    console.error(`❌ Environment file ${envFile} not found!`);
    process.exit(1);
}

console.log(`\n======================================================`);
console.log(`🚀 Executing ${target.toUpperCase()} Task Workflow`);
console.log(`======================================================\n`);

// 1. Sync active .env file
console.log(`[1] 📋 Syncing ${envFile} -> .env ...`);
fs.copyFileSync(targetEnvPath, activeEnvPath);
console.log(`    Active .env updated to ${target.toUpperCase()}.\n`);

const supabaseProjectRef = target === 'dev' ? 'ourvebdzvojdexygcmbl' : 'gevdamoroboqxpacbdkk';

if (target === 'dev') {
    // DEV WORKFLOW: No Vercel deploy, deploy DEV Edge Function + start local dev server
    console.log(`[2] ⚡ Deploying Supabase Edge Function (process-bucket) to DEV [${supabaseProjectRef}]...`);
    try {
        const deployCmd = `npx supabase functions deploy process-bucket --no-verify-jwt --project-ref ${supabaseProjectRef}`;
        console.log(`    Executing: ${deployCmd}`);
        execSync(deployCmd, { stdio: 'inherit' });
        console.log(`    Supabase Edge Function deployed to DEV.\n`);
    } catch (e) {
        console.warn(`⚠️ Supabase CLI deploy returned a non-zero exit code. Continuing to local server...\n`);
    }

    console.log(`[3] 💻 Launching Local Dev Server (npm run dev)...`);
    execSync('npm run dev', { stdio: 'inherit' });

} else {
    // PROD WORKFLOW: Build API + UI, deploy PROD Edge Function, deploy to Vercel Prod
    console.log(`[2] 📦 Building application (API + UI)...`);
    try {
        execSync('npm run build', { stdio: 'inherit' });
        console.log(`    Build completed successfully.\n`);
    } catch (e) {
        console.error(`❌ Build failed. Stopping deployment.`);
        process.exit(1);
    }

    console.log(`[3] ⚡ Deploying Supabase Edge Function (process-bucket) to PROD [${supabaseProjectRef}]...`);
    try {
        const deployCmd = `npx supabase functions deploy process-bucket --no-verify-jwt --project-ref ${supabaseProjectRef}`;
        console.log(`    Executing: ${deployCmd}`);
        execSync(deployCmd, { stdio: 'inherit' });
        console.log(`    Supabase Edge Function deployed to PROD.\n`);
    } catch (e) {
        console.warn(`⚠️ Supabase CLI deploy returned a non-zero exit code. Continuing to Vercel deployment...\n`);
    }

    console.log(`[4] 🌐 Deploying to Vercel Production (npx vercel --prod)...`);
    try {
        execSync('npx vercel --prod', { stdio: 'inherit' });
        console.log(`\n✅ PROD Deployment Pipeline Complete!`);
    } catch (e) {
        console.error(`❌ Vercel deployment failed.`);
        process.exit(1);
    }
}
