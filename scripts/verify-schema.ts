#!/usr/bin/env npx tsx

/**
 * Verify database schema
 * Lists all tables and shows members table columns
 * Usage: npx tsx scripts/verify-schema.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

console.log('🔍 Verifying database schema...\n');

const tables = await sql`
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name
`;

console.log('📋 Tables created:');
tables.forEach(t => console.log(`  ✓ ${t.table_name}`));

console.log('\n👥 Members table columns:');
const columns = await sql`
  SELECT column_name, data_type, character_maximum_length, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'members' 
  ORDER BY ordinal_position
`;

columns.forEach(c => {
  const type = c.data_type + (c.character_maximum_length ? `(${c.character_maximum_length})` : '');
  const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
  console.log(`  • ${c.column_name}: ${type}${def}`);
});

await sql.end();
