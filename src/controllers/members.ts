import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';
import { sendTwilioMessage } from '../services/twilio.js';
import { getRequestBody } from '../utils/request.js';
import { normalizePhoneNumber } from '../utils/normalize.js';
import { t, getLang } from '../services/i18n.js';

/**
 * Send confirmation request message to member
 */
async function sendConfirmationMessage(phoneNumber: string, memberName?: string, lang?: string): Promise<void> {
    const name = memberName ? ` ${memberName}` : '';
    const message = t(lang, 'confirmation_request', { name });
    const logoUrl = process.env.JENTYX_LOGO_URL;
    await sendTwilioMessage(phoneNumber, message, 'whatsapp', logoUrl);
}

/**
 * Send invitation message from an OM to join their node
 */
async function sendInvitationMessage(phoneNumber: string, memberName?: string, nodeName?: string, lang?: string): Promise<void> {
    const name = memberName ? ` ${memberName}` : '';
    const company = nodeName || 'our team';
    const message = t(lang, 'invitation', { name, company });
    const logoUrl = process.env.JENTYX_LOGO_URL;
    await sendTwilioMessage(phoneNumber, message, 'whatsapp', logoUrl);
}

/**
 * GET /api/members
 * Get members list with pagination and search
 * OM: only their node, SU: all nodes
 */
export async function getMembers(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const nodeId = c.req.query('nodeId');
        const status = c.req.query('status');
        const search = c.req.query('search') || '';
        const page = parseInt(c.req.query('page') || '1');
        const limit = parseInt(c.req.query('limit') || '20');
        const offset = (page - 1) * limit;

        // Build conditions
        let conditions: string[] = [];

        if (user.role === 'OM') {
            conditions.push(`(m.company_id = ${user.nodeId} OR m.pending_node_id = ${user.nodeId})`);
        } else if (nodeId) {
            conditions.push(`(m.company_id = ${parseInt(nodeId)} OR m.pending_node_id = ${parseInt(nodeId)})`);
        }

        if (status) {
            conditions.push(`m.status = '${status}'`);
        }

        if (search.trim()) {
            const searchTerm = search.trim().replace(/'/g, "''");
            conditions.push(`(m.full_name ILIKE '%${searchTerm}%' OR m.phone_number ILIKE '%${searchTerm}%')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await sql.unsafe(`
            SELECT COUNT(*)::int as total
            FROM members m
            ${whereClause}
        `);
        const total = countResult[0]?.total || 0;

        // Get members with pagination and effective rate
        const members = await sql.unsafe(`
            SELECT 
                m.*, 
                n.name as node_name,
                n.default_hourly_rate as base_rate,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as effective_rate,
                rc.position_name as matched_rate_role
            FROM members m
            LEFT JOIN nodes n ON COALESCE(m.company_id, m.pending_node_id) = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = COALESCE(m.company_id, m.pending_node_id) 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            ${whereClause}
            ORDER BY m.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `);

        return c.json({
            members,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('[Members] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * Shared member activation logic (used by Web Admin approve & WhatsApp YES confirmation)
 */
export async function activateMember(
    sql: Sql,
    memberId: number,
    targetNodeId?: number
): Promise<{ success: boolean; member?: any; nodeName?: string }> {
    const members = await sql`
        SELECT m.*
        FROM members m
        WHERE m.id = ${memberId}
    `;

    if (members.length === 0) {
        return { success: false };
    }

    const member = members[0];
    const finalNodeId = targetNodeId || member.pending_node_id || member.company_id;

    await sql`
        UPDATE members 
        SET status = 'active',
            company_id = ${finalNodeId || null},
            pending_node_id = NULL,
            onboarded_at = NOW()
        WHERE id = ${member.id}
    `;

    // Fetch node name for onboarding welcome message
    let nodeName: string | undefined = undefined;
    if (finalNodeId) {
        const nodes = await sql`SELECT name FROM nodes WHERE id = ${finalNodeId}`;
        if (nodes.length > 0) nodeName = nodes[0].name;
    }

    console.log(`[Members] Member #${member.id} activated, assigned to node ${finalNodeId || 'none'}`);
    return { success: true, member, nodeName };
}

/**
 * POST /api/members/:id/approve
 * Approve a pending (orphan) member
 * OM only
 */
export async function approveMember(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const memberId = parseInt(c.req.param('id'));

        // Get member
        const members = await sql`SELECT * FROM members WHERE id = ${memberId}`;
        if (members.length === 0) {
            return c.json({ error: 'Member not found' }, 404);
        }

        const member = members[0];

        // OM can only approve for their node
        if (user.role === 'OM' && member.company_id && member.company_id !== user.nodeId) {
            return c.json({ error: 'Forbidden' }, 403);
        }

        const res = await activateMember(sql, memberId, user.nodeId);

        // Send WhatsApp welcome message with logo
        try {
            const logoUrl = process.env.JENTYX_LOGO_URL;
            const lang = getLang(member);
            const name = member.full_name ? `, ${member.full_name}` : '';
            const team = res.nodeName ? ` (${res.nodeName})` : '';
            const welcomeMsg = t(lang, 'welcome', { name, team });

            await sendTwilioMessage(member.phone_number, welcomeMsg, 'whatsapp', logoUrl);
        } catch (err) {
            console.error('[Members] Failed to send welcome message:', err);
        }

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Members] Approve error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/members
 * Invite a member to join the OM's node.
 * This does NOT create a new member - it finds an existing pending member and sends them a confirmation message.
 * When the member confirms, their company_id will be set to this node.
 */
export async function inviteMember(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');

        // VERCEL ADAPTER FIX: Check if body is pre-parsed
        // VERCEL ADAPTER FIX: Use helper to handle pre-parsed body
        const body = await getRequestBody(c);
        const { phoneNumber } = body;

        if (!phoneNumber) {
            return c.json({ error: 'Phone number is required' }, 400);
        }

        // Normalize phone number
        const normalizedPhone = normalizePhoneNumber(phoneNumber);

        // Determine the node ID (OM uses their node, SU can specify)
        const targetNodeId = user.role === 'SU' && body.nodeId ? body.nodeId : user.nodeId;

        if (!targetNodeId) {
            return c.json({ error: 'Node ID is required' }, 400);
        }
        const fullName = body.fullName || body.name;
        const role = body.role ? body.role.trim() : 'General Labor';

        // Check if member already exists with this company_id (already in this node)
        const existingInNode = await sql`
            SELECT id FROM members 
            WHERE phone_number = ${normalizedPhone} 
            AND company_id = ${targetNodeId}
        `;

        if (existingInNode.length > 0) {
            return c.json({
                error: 'A member with this phone number already exists in this node'
            }, 409);
        }

        // Find existing pending member with this phone number (created when they first messaged)
        const existingMembers = await sql`
            SELECT * FROM members 
            WHERE phone_number = ${normalizedPhone}
        `;

        let member;

        if (existingMembers.length > 0) {
            // Member exists - update with pending invitation
            member = existingMembers[0];

            // Check if already has a company_id (already belongs to another node)
            if (member.company_id && member.status === 'active') {
                return c.json({
                    error: 'This member already belongs to another node'
                }, 409);
            }

            // Update member with pending invitation
            await sql`
                UPDATE members 
                SET pending_node_id = ${targetNodeId},
                    invited_by = ${user.id},
                    full_name = COALESCE(${fullName || null}, full_name),
                    role = COALESCE(${role || null}, role),
                    status = 'pending'
                WHERE id = ${member.id}
            `;

            console.log(`[Members] Updated existing member #${member.id} with pending invitation to node ${targetNodeId}`);
        } else {
            // No existing member - create a new pending member record
            const [newMember] = await sql`
                INSERT INTO members (phone_number, full_name, role, pending_node_id, invited_by, status, domain)
                VALUES (${normalizedPhone}, ${fullName || null}, ${role}, ${targetNodeId}, ${user.id}, 'pending', 'construction')
                RETURNING *
            `;
            member = newMember;
            console.log(`[Members] Created new pending member #${member.id} for node ${targetNodeId}`);
        }

        // Get node name for the message
        const nodes = await sql`SELECT name FROM nodes WHERE id = ${targetNodeId}`;
        const nodeName = nodes.length > 0 ? nodes[0].name : 'our team';

        // Send invitation message via WhatsApp
        try {
            await sendInvitationMessage(normalizedPhone, fullName, nodeName);
            console.log(`[Members] Sent invitation to ${normalizedPhone} for node "${nodeName}"`);
        } catch (err) {
            console.error('[Members] Failed to send invitation message:', err);
            // Don't fail the request
        }

        return c.json({
            member,
            message: `Invitation sent to ${normalizedPhone}. They will be added to your node when they confirm.`
        });
    } catch (error: any) {
        console.error('[Members] Invite error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/members/:id
 * Update member
 */
export async function updateMember(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const memberId = parseInt(c.req.param('id'));

        // VERCEL ADAPTER FIX: Check if body is pre-parsed
        // VERCEL ADAPTER FIX: Use helper to handle pre-parsed body
        const body = await getRequestBody(c);

        // Convert undefined to null for postgres.js compatibility
        const fullName = body.fullName ?? null;
        const domain = body.domain ?? null;
        const role = body.role ?? null;
        const status = body.status ?? null;
        const languagePreference = body.language ?? null;

        const [member] = await sql`
            UPDATE members
            SET full_name = COALESCE(${fullName}, full_name),
                domain = COALESCE(${domain}, domain),
                role = COALESCE(${role}, role),
                status = COALESCE(${status}, status),
                language_preference = COALESCE(${languagePreference}, language_preference)
            WHERE id = ${memberId}
            ${user.role === 'OM' ? sql`AND company_id = ${user.nodeId}` : sql``}
            RETURNING *
        `;

        if (!member) {
            return c.json({ error: 'Member not found or access denied' }, 404);
        }

        return c.json({ member });
    } catch (error: any) {
        console.error('[Members] Update error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * DELETE /api/members/:id
 * Delete (soft delete) a member
 */
export async function deleteMember(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const memberId = parseInt(c.req.param('id'));

        // Get member first to verify access
        const members = await sql`SELECT * FROM members WHERE id = ${memberId}`;
        if (members.length === 0) {
            return c.json({ error: 'Member not found' }, 404);
        }

        const member = members[0];

        // OM can only delete members from their node
        if (user.role === 'OM' && member.company_id !== user.nodeId) {
            return c.json({ error: 'Forbidden' }, 403);
        }

        // Soft delete by setting status to 'inactive'
        await sql`
            UPDATE members 
            SET status = 'inactive'
            WHERE id = ${memberId}
        `;

        console.log(`[Members] Deleted (soft) member #${memberId} by user #${user.id}`);

        return c.json({ success: true, message: 'Member deleted successfully' });
    } catch (error: any) {
        console.error('[Members] Delete error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/members/:id/resend-confirmation
 * Resend confirmation message to a pending member
 */
export async function resendConfirmation(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const memberId = parseInt(c.req.param('id'));

        // Get member
        const members = await sql`SELECT * FROM members WHERE id = ${memberId}`;
        if (members.length === 0) {
            return c.json({ error: 'Member not found' }, 404);
        }

        const member = members[0];

        // OM can only resend for their node
        const targetNodeId = member.company_id || member.pending_node_id;
        if (user.role === 'OM' && targetNodeId !== user.nodeId) {
            return c.json({ error: 'Forbidden' }, 403);
        }

        // Only resend to pending members
        if (member.status !== 'pending') {
            return c.json({ error: 'Member is not in pending status' }, 400);
        }

        // Send confirmation message
        try {
            if (member.pending_node_id) {
                const nodes = await sql`SELECT name FROM nodes WHERE id = ${member.pending_node_id}`;
                const nodeName = nodes.length > 0 ? nodes[0].name : 'our team';
                await sendInvitationMessage(member.phone_number, member.full_name, nodeName);
            } else {
                await sendConfirmationMessage(member.phone_number, member.full_name);
            }
            console.log(`[Members] Resent confirmation/invitation to ${member.phone_number}`);
        } catch (err) {
            console.error('[Members] Failed to resend confirmation/invitation:', err);
            return c.json({ error: 'Failed to send confirmation message' }, 500);
        }

        return c.json({ success: true, message: 'Confirmation message sent' });
    } catch (error: any) {
        console.error('[Members] Resend confirmation error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * Handle member confirmation from webhook
 * Called when a pending member replies "CONFIRM"
 * Sets company_id from pending_node_id if an invitation is pending
 */
export async function confirmMemberByPhone(sql: Sql, phoneNumber: string): Promise<{ success: boolean; member?: any; nodeName?: string }> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Find pending member with this phone
    const members = await sql`
        SELECT * FROM members 
        WHERE phone_number = ${normalizedPhone} 
        AND status = 'pending'
    `;

    if (members.length === 0) {
        return { success: false };
    }

    return await activateMember(sql, members[0].id);
}

