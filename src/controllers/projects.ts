import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';
import { getRequestBody } from '../utils/request.js';

/**
 * GET /api/projects
 * Get projects list with pagination and search
 */
export async function getProjects(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const nodeId = c.req.query('nodeId');
        const search = c.req.query('search') || '';
        const page = parseInt(c.req.query('page') || '1');
        const limit = parseInt(c.req.query('limit') || '10');
        const offset = (page - 1) * limit;

        // Build conditions
        let conditions: string[] = [];

        if (user.role === 'OM') {
            conditions.push(`p.node_id = ${user.nodeId}`);
        } else if (nodeId) {
            conditions.push(`p.node_id = ${parseInt(nodeId)}`);
        }

        if (search.trim()) {
            const searchTerm = search.trim().replace(/'/g, "''");
            conditions.push(`(p.name ILIKE '%${searchTerm}%' OR p.aliases ILIKE '%${searchTerm}%')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await sql.unsafe(`
            SELECT COUNT(*)::int as total
            FROM projects p
            ${whereClause}
        `);
        const total = countResult[0]?.total || 0;

        // Get projects with pagination
        const projects = await sql.unsafe(`
            SELECT p.*, n.name as node_name
            FROM projects p
            LEFT JOIN nodes n ON p.node_id = n.id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `);

        return c.json({
            projects,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('[Projects] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function createProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const body = await getRequestBody(c);
        const { name, nodeId, radius } = body;

        if (!name) {
            return c.json({ error: 'Project name is required' }, 400);
        }

        // Determine node_id
        let targetNodeId;
        if (user.role === 'OM') {
            targetNodeId = user.nodeId;
        } else {
            if (!nodeId) {
                return c.json({ error: 'Node ID is required for Super User' }, 400);
            }
            targetNodeId = nodeId;
        }

        const radiusVal = radius !== undefined && radius !== '' ? parseInt(radius, 10) : null;

        const [project] = await sql`
            INSERT INTO projects (node_id, name, is_active, radius)
            VALUES (${targetNodeId}, ${name}, true, ${radiusVal})
            RETURNING *
        `;

        return c.json({ project });
    } catch (error: any) {
        console.error('[Projects] Create error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/projects/:id
 * Update a project
 */
export async function updateProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));
        const body = await getRequestBody(c);
        const { name, isActive, aliases, nodeId, radius } = body;

        // Convert undefined to null for postgres
        const nameVal = name ?? null;
        const isActiveVal = isActive ?? null;
        const aliasesVal = aliases ?? null;
        const nodeIdVal = nodeId ?? null;
        
        let radiusUpdate = sql``;
        if (radius !== undefined) {
            const radiusVal = radius === '' || radius === null ? null : parseInt(radius, 10);
            radiusUpdate = sql`, radius = ${radiusVal}`;
        }

        // SU can change node_id, OM cannot
        const [project] = await sql`
            UPDATE projects
            SET name = COALESCE(${nameVal}, name),
                is_active = COALESCE(${isActiveVal}, is_active),
                aliases = COALESCE(${aliasesVal}, aliases)
                ${radiusUpdate}
                ${user.role === 'SU' && nodeIdVal ? sql`, node_id = ${nodeIdVal}` : sql``}
            WHERE id = ${projectId}
            ${user.role === 'OM' ? sql`AND node_id = ${user.nodeId}` : sql``}
            RETURNING *
        `;

        if (!project) {
            return c.json({ error: 'Project not found or access denied' }, 404);
        }

        return c.json({ project });
    } catch (error: any) {
        console.error('[Projects] Update error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * DELETE /api/projects/:id
 * Hard delete a project (only if no associated tickets)
 */
export async function deleteProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));

        // Check if project has any associated buckets/tickets
        const [ticketCount] = await sql`
            SELECT COUNT(*)::int as count FROM buckets WHERE project_id = ${projectId}
        `;

        if (ticketCount.count > 0) {
            return c.json({
                error: `Cannot delete: project has ${ticketCount.count} associated ticket(s)`
            }, 400);
        }

        // Check access for OM users
        if (user.role === 'OM') {
            const [project] = await sql`
                SELECT id FROM projects WHERE id = ${projectId} AND node_id = ${user.nodeId}
            `;
            if (!project) {
                return c.json({ error: 'Project not found or access denied' }, 404);
            }
        }

        // Hard delete the project
        const [deleted] = await sql`
            DELETE FROM projects WHERE id = ${projectId} RETURNING id
        `;

        if (!deleted) {
            return c.json({ error: 'Project not found' }, 404);
        }

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Projects] Delete error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * GET /api/projects/:id/summary
 * Get cumulative metadata and financial summary for a project
 */
export async function getProjectSummary(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));

        const [project] = await sql`
            SELECT p.*, n.name as node_name, n.default_hourly_rate as base_rate
            FROM projects p
            LEFT JOIN nodes n ON p.node_id = n.id
            WHERE p.id = ${projectId}
            ${user.role === 'OM' ? sql`AND p.node_id = ${user.nodeId}` : sql``}
        `;

        if (!project) {
            return c.json({ error: 'Project not found or access denied' }, 404);
        }

        const [stats] = await sql`
            SELECT 
                COUNT(b.id)::int as total_tickets,
                COALESCE(SUM(b.hours), 0)::numeric as total_hours,
                COALESCE(SUM(
                    COALESCE(b.hours, 8) * COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)
                ), 0)::numeric as total_labor_cost,
                COUNT(DISTINCT b.member_id)::int as active_workers_count,
                COUNT(b.id) FILTER (WHERE b.image_urls IS NOT NULL AND b.image_urls != '[]' AND b.image_urls != '')::int as total_photos_count,
                COUNT(b.id) FILTER (WHERE b.is_flagged = true OR b.potential_change = true)::int as flagged_count,
                MIN(b.created_at) as first_activity_at,
                MAX(b.created_at) as latest_activity_at
            FROM buckets b
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = b.node_id 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            WHERE b.project_id = ${projectId}
        `;

        // Get top trade breakdown
        const tradeBreakdown = await sql`
            SELECT 
                COALESCE(m.role, 'General Labor') as role,
                COUNT(b.id)::int as log_count,
                COALESCE(SUM(b.hours), 0)::numeric as hours,
                COALESCE(SUM(
                    COALESCE(b.hours, 8) * COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)
                ), 0)::numeric as cost
            FROM buckets b
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = b.node_id 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            WHERE b.project_id = ${projectId}
            GROUP BY COALESCE(m.role, 'General Labor')
            ORDER BY hours DESC
        `;

        return c.json({
            project,
            stats: {
                totalTickets: stats.total_tickets || 0,
                totalHours: parseFloat(stats.total_hours || '0'),
                totalLaborCost: parseFloat(stats.total_labor_cost || '0'),
                activeWorkersCount: stats.active_workers_count || 0,
                totalPhotosCount: stats.total_photos_count || 0,
                flaggedCount: stats.flagged_count || 0,
                firstActivityAt: stats.first_activity_at,
                latestActivityAt: stats.latest_activity_at,
            },
            tradeBreakdown: tradeBreakdown.map(t => ({
                role: t.role,
                logCount: t.log_count,
                hours: parseFloat(t.hours || '0'),
                cost: parseFloat(t.cost || '0')
            }))
        });
    } catch (error: any) {
        console.error('[Projects] Summary error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * GET /api/projects/:id/timeline
 * Get chronological timeline of work grouped by date
 */
export async function getProjectTimeline(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const workerId = c.req.query('workerId');

        const [project] = await sql`
            SELECT p.*, n.name as node_name
            FROM projects p
            LEFT JOIN nodes n ON p.node_id = n.id
            WHERE p.id = ${projectId}
            ${user.role === 'OM' ? sql`AND p.node_id = ${user.nodeId}` : sql``}
        `;

        if (!project) {
            return c.json({ error: 'Project not found or access denied' }, 404);
        }

        let conditions = [`b.project_id = ${projectId}`];
        if (startDate) {
            conditions.push(`b.created_at >= '${startDate.replace(/'/g, "''")} 00:00:00'`);
        }
        if (endDate) {
            conditions.push(`b.created_at <= '${endDate.replace(/'/g, "''")} 23:59:59'`);
        }
        if (workerId) {
            conditions.push(`b.member_id = ${parseInt(workerId)}`);
        }

        const rawEntries = await sql.unsafe(`
            SELECT 
                b.id,
                b.summary,
                b.raw_text,
                b.hours,
                b.image_urls,
                b.audio_urls,
                b.transcripts,
                b.status,
                b.is_flagged,
                b.flag_type,
                b.flag_reason,
                b.potential_change,
                b.created_at,
                b.member_id,
                m.full_name as member_name,
                m.phone_number as member_phone,
                COALESCE(m.role, 'General Labor') as worker_role,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as worker_rate,
                (COALESCE(b.hours, 8) * COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00))::numeric as labor_cost,
                t.location,
                t.material
            FROM buckets b
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = b.node_id 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            LEFT JOIN txns t ON b.id = t.bucket_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY b.created_at DESC
        `);

        // Group entries by date (YYYY-MM-DD)
        const daysMap = new Map<string, any>();

        for (const entry of rawEntries) {
            const dateStr = new Date(entry.created_at).toISOString().split('T')[0];
            if (!daysMap.has(dateStr)) {
                daysMap.set(dateStr, {
                    date: dateStr,
                    totalHours: 0,
                    totalLaborCost: 0,
                    workersSet: new Set<number>(),
                    flaggedCount: 0,
                    entries: []
                });
            }

            const dayGroup = daysMap.get(dateStr);
            const hoursVal = parseFloat(entry.hours || '8');
            const costVal = parseFloat(entry.labor_cost || '0');

            dayGroup.totalHours += hoursVal;
            dayGroup.totalLaborCost += costVal;
            if (entry.member_id) dayGroup.workersSet.add(entry.member_id);
            if (entry.is_flagged || entry.potential_change) dayGroup.flaggedCount++;

            dayGroup.entries.push({
                id: entry.id,
                summary: entry.summary || entry.raw_text || 'General Work',
                rawText: entry.raw_text,
                hours: hoursVal,
                workerName: entry.member_name || entry.member_phone || 'Worker',
                workerPhone: entry.member_phone,
                workerRole: entry.worker_role,
                workerRate: parseFloat(entry.worker_rate || '85.00'),
                laborCost: costVal,
                imageUrls: entry.image_urls ? (typeof entry.image_urls === 'string' ? JSON.parseSafe(entry.image_urls) : entry.image_urls) : [],
                audioUrls: entry.audio_urls ? (typeof entry.audio_urls === 'string' ? JSON.parseSafe(entry.audio_urls) : entry.audio_urls) : [],
                transcript: entry.transcripts,
                status: entry.status,
                isFlagged: entry.is_flagged,
                flagType: entry.flag_type,
                flagReason: entry.flag_reason,
                potentialChange: entry.potential_change,
                location: entry.location,
                material: entry.material,
                createdAt: entry.created_at,
            });
        }

        const days = Array.from(daysMap.values()).map(day => ({
            date: day.date,
            totalHours: Math.round(day.totalHours * 100) / 100,
            totalLaborCost: Math.round(day.totalLaborCost * 100) / 100,
            workersCount: day.workersSet.size,
            flaggedCount: day.flaggedCount,
            entries: day.entries
        }));

        return c.json({
            project,
            days,
            totalDays: days.length,
            totalEntries: rawEntries.length
        });
    } catch (error: any) {
        console.error('[Projects] Timeline error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * Helper to safely parse JSON strings or return array
 */
function parseSafe(val: any) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return typeof val === 'string' && val.startsWith('http') ? [val] : [];
    }
}
(JSON as any).parseSafe = parseSafe;

/**
 * POST /api/projects/:id/daily-summary
 * Synthesize an AI Project Progress Report (GC to Customer) using Groq for the selected time filter
 */
export async function generateProjectDailyRollup(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));
        const body = await getRequestBody(c);
        const { startDate, endDate, date, timeframeLabel } = body;

        const [project] = await sql`
            SELECT p.*, n.name as node_name
            FROM projects p
            LEFT JOIN nodes n ON p.node_id = n.id
            WHERE p.id = ${projectId}
            ${user.role === 'OM' ? sql`AND p.node_id = ${user.nodeId}` : sql``}
        `;

        if (!project) {
            return c.json({ error: 'Project not found' }, 404);
        }

        // Build date filter conditions
        let dateCondition = sql``;
        let displayPeriod = timeframeLabel || 'Selected Period';

        if (startDate && endDate) {
            dateCondition = sql`AND b.created_at >= ${startDate + ' 00:00:00'} AND b.created_at <= ${endDate + ' 23:59:59'}`;
            displayPeriod = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
        } else if (date) {
            dateCondition = sql`AND DATE(b.created_at) = ${date}`;
            displayPeriod = date;
        }

        // Fetch logs for this period
        const periodLogs = await sql`
            SELECT 
                b.id,
                b.summary,
                b.raw_text,
                b.hours,
                b.is_flagged,
                b.flag_type,
                b.flag_reason,
                b.potential_change,
                b.created_at,
                m.full_name as member_name,
                COALESCE(m.role, 'General Labor') as worker_role,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as worker_rate,
                (COALESCE(b.hours, 8) * COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00))::numeric as labor_cost,
                t.location,
                t.material
            FROM buckets b
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = b.node_id 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            LEFT JOIN txns t ON b.id = t.bucket_id
            WHERE b.project_id = ${projectId}
            ${dateCondition}
            ORDER BY b.created_at ASC
        `;

        if (periodLogs.length === 0) {
            return c.json({
                period: displayPeriod,
                summary: `No field work was recorded for ${project.name} during ${displayPeriod}.`,
                milestones: [],
                tradeBreakdown: [],
                totalHours: 0,
                workersCount: 0,
                totalCost: 0
            });
        }

        const totalHours = periodLogs.reduce((acc, l) => acc + parseFloat(l.hours || '8'), 0);
        const totalCost = periodLogs.reduce((acc, l) => acc + parseFloat(l.labor_cost || '0'), 0);
        const uniqueWorkers = new Set(periodLogs.map(l => l.member_name || 'Worker')).size;

        // Group by worker
        const workerMap = new Map<string, {
            workerName: string;
            role: string;
            rate: number;
            hours: number;
            cost: number;
            ticketCount: number;
            ticketDescriptions: string[];
        }>();

        for (const l of periodLogs) {
            const name = l.member_name || 'Worker';
            if (!workerMap.has(name)) {
                workerMap.set(name, {
                    workerName: name,
                    role: l.worker_role || 'General Labor',
                    rate: parseFloat(l.worker_rate || '85.00'),
                    hours: 0,
                    cost: 0,
                    ticketCount: 0,
                    ticketDescriptions: []
                });
            }
            const w = workerMap.get(name)!;
            const h = parseFloat(l.hours || '8');
            const c = parseFloat(l.labor_cost || '0');
            w.hours += h;
            w.cost += c;
            w.ticketCount++;
            
            const loc = l.location ? ` @ ${l.location}` : '';
            const mat = l.material ? ` (${l.material})` : '';
            w.ticketDescriptions.push(`${l.summary || l.raw_text}${loc}${mat} [${h}h]`);
        }

        const workersData = Array.from(workerMap.values()).map(w => ({
            ...w,
            hours: Math.round(w.hours * 10) / 10,
            cost: Math.round(w.cost * 100) / 100
        }));

        // Format prompt for Groq
        const workerPromptBlocks = workersData.map(w => 
            `Worker: ${w.workerName} (${w.role}, ${w.hours} hrs total, ${w.ticketCount} tickets)\nTickets:\n` + 
            w.ticketDescriptions.map(d => `  - ${d}`).join('\n')
        ).join('\n\n');

        let overallBullets: string[] = [];
        let overallSummary = '';
        let workerBulletsMap = new Map<string, string[]>();

        try {
            const Groq = (await import('groq-sdk')).default;
            const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
            const model = process.env.GENERAL_MODEL || 'openai/gpt-oss-20b';

            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a Construction Project Manager writing a concise, punchy Project Progress Report for the customer.
Avoid long essays, filler text, or corporate fluff. Make it clear and easy to read at a glance.

Format Requirements:
1. "overallBullets": Array of 3 to 5 concise, factual bullet points highlighting the key work completed across trades, locations, and milestones.
2. "workerSummaries": Array of objects (one per worker), where each worker has:
   - "workerName": Exact worker name
   - "bullets": Array of 2 to 4 concise bullet points summarizing specific tasks, site locations, and materials handled by this worker.

Return JSON in this EXACT structure:
{
  "overallBullets": [
    "Trade/Scope: Specific task or milestone completed",
    "Trade/Scope: Specific task or milestone completed"
  ],
  "workerSummaries": [
    {
      "workerName": "Exact Worker Name",
      "bullets": [
        "Specific task or milestone completed",
        "Specific task or milestone completed"
      ]
    }
  ]
}`
                    },
                    {
                        role: "user",
                        content: `Project Name: ${project.name}
Reporting Period: ${displayPeriod}
Total Labor Hours: ${totalHours.toFixed(1)} hrs
Total Active Crew: ${uniqueWorkers} workers

WORKER TICKETS BREAKDOWN:
${workerPromptBlocks}

Generate the concise customer progress report now.`
                    }
                ],
                model: model,
                response_format: { type: "json_object" },
                temperature: 0.2
            });

            const content = completion.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed.overallBullets) && parsed.overallBullets.length > 0) {
                overallBullets = parsed.overallBullets;
                overallSummary = parsed.overallBullets.join('\n');
            } else if (parsed.overallSummary) {
                overallSummary = parsed.overallSummary;
                overallBullets = typeof parsed.overallSummary === 'string' ? parsed.overallSummary.split('\n').filter(Boolean) : [];
            }

            if (Array.isArray(parsed.workerSummaries)) {
                for (const ws of parsed.workerSummaries) {
                    if (ws.workerName) {
                        const nameKey = ws.workerName.toLowerCase();
                        if (Array.isArray(ws.bullets) && ws.bullets.length > 0) {
                            workerBulletsMap.set(nameKey, ws.bullets);
                        } else if (ws.summary) {
                            workerBulletsMap.set(nameKey, [ws.summary]);
                        }
                    }
                }
            }
        } catch (err: any) {
            console.error('[Projects] Progress summary AI error:', err);
            overallBullets = [`Completed ${totalHours.toFixed(1)} total hours of field work across ${uniqueWorkers} active crew members.`];
            overallSummary = overallBullets[0];
        }

        const workerReports = workersData.map(w => {
            const aiBullets = workerBulletsMap.get(w.workerName.toLowerCase());
            return {
                workerName: w.workerName,
                role: w.role,
                hours: w.hours,
                cost: w.cost,
                ticketCount: w.ticketCount,
                bullets: (aiBullets && aiBullets.length > 0) ? aiBullets : w.ticketDescriptions.slice(0, 4),
                summary: (aiBullets && aiBullets.length > 0) ? aiBullets.join('; ') : w.ticketDescriptions.join('; ')
            };
        });

        return c.json({
            period: displayPeriod,
            projectId: project.id,
            projectName: project.name,
            nodeName: project.node_name,
            overallSummary,
            overallBullets,
            workerReports,
            totalHours: Math.round(totalHours * 10) / 10,
            workersCount: uniqueWorkers,
            totalCost: Math.round(totalCost * 100) / 100
        });
    } catch (error: any) {
        console.error('[Projects] Progress summary error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
