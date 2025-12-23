#!/usr/bin/env npx tsx

/**
 * Helper script to inspect bucket state during testing
 * Usage: npx tsx scripts/inspect-buckets.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function inspect() {
    console.log('\n📦 RECENT BUCKETS\n');

    const buckets = await sql`
    SELECT 
      b.id,
      b.status,
      b.project_id,
      p.name as project_name,
      LEFT(b.raw_text, 50) as text_preview,
      b.image_urls,
      b.audio_urls,
      b.transcripts,
      b.validation_errors,
      b.created_at
    FROM buckets b
    LEFT JOIN projects p ON b.project_id = p.id
    ORDER BY b.id DESC
    LIMIT 10
  `;

    for (const b of buckets) {
        const images = b.image_urls ? JSON.parse(b.image_urls).length : 0;
        const audio = b.audio_urls ? JSON.parse(b.audio_urls).length : 0;
        const transcripts = b.transcripts ? JSON.parse(b.transcripts).length : 0;

        console.log(`#${b.id} [${b.status}]`);
        console.log(`  Project: ${b.project_name || 'None'}`);
        console.log(`  Text: "${b.text_preview || '(empty)'}..."`);
        console.log(`  Media: ${images} images, ${audio} audio, ${transcripts} transcripts`);
        if (b.validation_errors) {
            console.log(`  ⚠️ Errors: ${b.validation_errors}`);
        }
        console.log(`  Created: ${b.created_at}`);
        console.log('');
    }

    console.log('\n👤 MEMBERS\n');

    const members = await sql`
    SELECT 
      m.id,
      m.full_name,
      m.phone_number,
      m.last_confirmed_project_id,
      p.name as last_project,
      m.project_confirmed_at
    FROM members m
    LEFT JOIN projects p ON m.last_confirmed_project_id = p.id
  `;

    for (const m of members) {
        const projectAge = m.project_confirmed_at
            ? Math.round((Date.now() - new Date(m.project_confirmed_at).getTime()) / 60000)
            : null;
        console.log(`${m.full_name} (${m.phone_number})`);
        console.log(`  Last Project: ${m.last_project || 'None'} ${projectAge !== null ? `(${projectAge} min ago)` : ''}`);
        console.log('');
    }

    console.log('\n⏸️ HOLDING TANK\n');

    const holding = await sql`SELECT * FROM holding_tank ORDER BY id DESC LIMIT 5`;

    if (holding.length === 0) {
        console.log('  (empty)');
    } else {
        for (const h of holding) {
            console.log(`#${h.id} [${h.status}] from ${h.from_phone}`);
            console.log(`  Text: "${h.raw_text?.slice(0, 50) || '(empty)'}..."`);
        }
    }

    await sql.end();
}

inspect();
