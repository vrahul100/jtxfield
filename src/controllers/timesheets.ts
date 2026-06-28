import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

export async function getTimesheets(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        
        let nodeCondition = '';
        if (user.role === 'OM') {
            nodeCondition = `AND b.node_id = ${user.nodeId}`;
        }
        
        const timesheets = await sql.unsafe(`
            SELECT 
                m.id as member_id,
                m.full_name as member_name,
                DATE_TRUNC('week', b.created_at) as week_start,
                SUM(CAST(COALESCE(b.hours, '0') AS numeric)) as total_hours,
                SUM(CASE WHEN b.type != 'non_scope' THEN CAST(COALESCE(b.hours, '0') AS numeric) ELSE 0 END) as billable_hours,
                SUM(CASE WHEN b.type = 'non_scope' THEN CAST(COALESCE(b.hours, '0') AS numeric) ELSE 0 END) as non_scope_hours,
                COUNT(b.id) as ticket_count,
                MAX(wt.status) as status,
                MAX(wt.id) as timesheet_id
            FROM buckets b
            JOIN members m ON b.member_id = m.id
            LEFT JOIN weekly_timesheets wt 
                ON wt.member_id = m.id AND wt.week_start_date = DATE_TRUNC('week', b.created_at)
            WHERE b.status NOT IN ('rejected', 'draft') ${nodeCondition}
            GROUP BY m.id, m.full_name, DATE_TRUNC('week', b.created_at)
            ORDER BY week_start DESC, m.full_name ASC
        `);
        
        return c.json({ timesheets });
    } catch (error: any) {
        console.error('[Timesheets] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

export async function getTimesheetDetails(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const memberId = parseInt(c.req.param('memberId'));
        const weekStart = c.req.query('weekStart');

        if (!memberId || !weekStart) return c.json({ error: 'Missing parameters' }, 400);

        let conditions = [`b.member_id = ${memberId}`];
        conditions.push(`DATE_TRUNC('week', b.created_at) = DATE_TRUNC('week', CAST('${weekStart}' AS timestamp))`);
        if (user.role === 'OM') conditions.push(`b.node_id = ${user.nodeId}`);

        const tickets = await sql.unsafe(`
            SELECT b.*, p.name as project_name 
            FROM buckets b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE ${conditions.join(' AND ')}
            ORDER BY b.created_at ASC
        `);

        return c.json({ tickets });
    } catch (error: any) {
        console.error('[Timesheets] Get details error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

export async function approveTimesheet(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const body = await c.req.json();
        const { memberId, weekStart, totalHours, billableHours, nonScopeHours } = body;

        if (!memberId || !weekStart) return c.json({ error: 'Missing parameters' }, 400);

        const [existing] = await sql`
            SELECT id FROM weekly_timesheets 
            WHERE member_id = ${memberId} AND week_start_date = CAST(${weekStart} AS timestamp)
        `;

        if (existing) {
            return c.json({ error: 'Timesheet is already approved.' }, 400);
        }

        const [timesheet] = await sql`
            INSERT INTO weekly_timesheets (
                member_id, node_id, week_start_date, total_hours, billable_hours, non_scope_hours, status, approved_by
            ) VALUES (
                ${memberId}, ${user.nodeId}, CAST(${weekStart} AS timestamp), ${totalHours || '0'}, ${billableHours || '0'}, ${nonScopeHours || '0'}, 'approved', ${user.id}
            ) RETURNING *
        `;

        return c.json({ timesheet });
    } catch (error: any) {
        console.error('[Timesheets] Approve error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

export async function exportTimesheetsCSV(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        
        let nodeCondition = sql``;
        if (user.role === 'OM') {
            nodeCondition = sql`AND wt.node_id = ${user.nodeId}`;
        }
        
        const timesheets = await sql`
            SELECT 
                m.full_name,
                wt.week_start_date,
                wt.total_hours,
                wt.billable_hours,
                wt.status,
                u.email as approver
            FROM weekly_timesheets wt
            JOIN members m ON wt.member_id = m.id
            LEFT JOIN users u ON wt.approved_by = u.id
            WHERE wt.status = 'approved' ${nodeCondition}
            ORDER BY wt.week_start_date DESC, m.full_name ASC
        `;
        
        let csv = 'Worker,Week Start,Total Hours,Billable Hours,Status,Approver\n';
        for (const t of timesheets) {
            csv += `"${t.full_name}",${new Date(t.week_start_date).toLocaleDateString()},${t.total_hours},${t.billable_hours},${t.status},${t.approver || 'System'}\n`;
        }
        
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="payroll_export_${Date.now()}.csv"`
            }
        });
    } catch (error: any) {
        console.error('[Timesheets] Export CSV error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
