import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/jtxfield';
const sql = postgres(connectionString);

async function fix() {
  try {
    await sql`ALTER TABLE nodes ADD CONSTRAINT nodes_company_code_unique UNIQUE (company_code)`;
    console.log("Successfully added unique constraint");
  } catch (e) {
    if (e.code === '42P07' || e.code === '42710' || e.message.includes('already exists')) {
       console.log("Constraint already exists or couldn't be added gracefully, that's fine.");
    } else {
       console.error(e);
    }
  } finally {
    process.exit(0);
  }
}
fix();
