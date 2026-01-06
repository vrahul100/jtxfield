import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function debug() {
    try {
        console.log('🔍 Debugging Reports Data...\n');

        // 1. Check Total Transactions
        const allTxns = await sql`SELECT * FROM txns`;
        console.log(`Total Transactions: ${allTxns.length}`);

        if (allTxns.length > 0) {
            console.log('Sample Transaction:', allTxns[0]);
        }

        // 2. Check Transactions by Company/Node
        const byNode = await sql`
            SELECT company_id, COUNT(*) 
            FROM txns 
            GROUP BY company_id
        `;
        console.log('\nTransactions by Company ID:', byNode);

        // 3. Check Date Range
        const dateRange = await sql`
            SELECT MIN(created_at) as min_date, MAX(created_at) as max_date 
            FROM txns
        `;
        console.log('\nTransaction Date Range:', dateRange[0]);

        // 4. Test Report Query Logic manually
        // Assuming OM user for Downtown Construction
        const downtown = await sql`SELECT id FROM nodes WHERE name ILIKE '%Downtown%' LIMIT 1`;
        if (downtown.length > 0) {
            const nodeId = downtown[0].id;
            console.log(`\nTesting Report Query for Node ID: ${nodeId} (Downtown)`);

            // Replicate the query from reports.ts
            const reportQuery = await sql`
                SELECT 
                    COALESCE(p.id, 0) as project_id,
                    COALESCE(p.name, 'Unassigned') as project_name,
                    COALESCE(SUM(t.time), 0)::float as total_hours,
                    COUNT(DISTINCT t.user_id)::int as member_count,
                    COUNT(t.id)::int as transaction_count
                FROM txns t
                LEFT JOIN projects p ON t.project_id = p.id
                WHERE 1=1 AND t.company_id = ${nodeId}
                GROUP BY p.id, p.name
                ORDER BY total_hours DESC
            `;
            console.log('Report Query Results:', reportQuery);
        }

    } catch (error) {
        console.error('Debug script error:', error);
    } finally {
        await sql.end();
    }
}

debug();
