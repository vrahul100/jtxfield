import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

interface ProjectSummary {
    project_id: number;
    project_name: string;
    total_hours: number;
    member_count: number;
    transaction_count: number;
}

interface MemberSummary {
    member_id: number;
    member_name: string;
    member_phone: string;
    total_hours: number;
    project_count: number;
    transaction_count: number;
}

/**
 * GET /api/reports/summary
 * Get aggregated labor summary by project and member
 */
export async function getSummaryReport(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');

        console.log('[Reports] Fetching summary for user:', user.email, 'role:', user.role);
        console.log('[Reports] Date range:', startDate, 'to', endDate);

        // Build node filter for OM users
        let nodeFilter = '';
        if (user.role === 'OM') {
            nodeFilter = `AND t.company_id = ${user.nodeId}`;
        }

        // Build WHERE clause for date filtering
        let dateWhere = '';
        if (startDate && endDate) {
            dateWhere = `AND t.created_at >= '${startDate}' AND t.created_at <= '${endDate}'`;
        }

        // Get summary by project
        const byProject = await sql.unsafe<ProjectSummary[]>(`
            SELECT 
                p.id as project_id,
                p.name as project_name,
                COALESCE(SUM(t.time), 0)::float as total_hours,
                COUNT(DISTINCT t.user_id)::int as member_count,
                COUNT(t.id)::int as transaction_count
            FROM projects p
            LEFT JOIN txns t ON t.project_id = p.id
            WHERE 1=1 ${nodeFilter} ${dateWhere}
            ${user.role === 'OM' ? `AND p.node_id = ${user.nodeId}` : ''}
            GROUP BY p.id, p.name
            HAVING COUNT(t.id) > 0
            ORDER BY total_hours DESC
        `);

        console.log('[Reports] By project results:', byProject.length, 'projects');

        // Get summary by member
        const byMember = await sql.unsafe<MemberSummary[]>(`
            SELECT 
                m.id as member_id,
                m.full_name as member_name,
                m.phone_number as member_phone,
                COALESCE(SUM(t.time), 0)::float as total_hours,
                COUNT(DISTINCT t.project_id)::int as project_count,
                COUNT(t.id)::int as transaction_count
            FROM members m
            INNER JOIN txns t ON t.user_id = m.id
            WHERE 1=1 ${nodeFilter} ${dateWhere}
            ${user.role === 'OM' ? `AND m.company_id = ${user.nodeId}` : ''}
            GROUP BY m.id, m.full_name, m.phone_number
            HAVING COUNT(t.id) > 0
            ORDER BY total_hours DESC
        `);

        console.log('[Reports] By member results:', byMember.length, 'members');

        // Calculate overall stats
        const totalHours = byMember.reduce((sum, m) => sum + m.total_hours, 0);
        const activeProjects = byProject.length;
        const activeMembers = byMember.length;

        console.log('[Reports] Summary stats:', { totalHours, activeProjects, activeMembers });

        return c.json({
            summary: {
                totalHours,
                activeProjects,
                activeMembers,
            },
            byProject,
            byMember,
        });
    } catch (error: any) {
        console.error('[Reports] Summary error:', error);
        return c.json({ error: 'Failed to fetch summary report' }, 500);
    }
}
