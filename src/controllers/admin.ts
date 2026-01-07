import { Hono } from 'hono';
import { Sql } from 'postgres';
import { sendTwilioMessage } from '../services/twilio.js';
import { getRequestBody } from '../utils/request.js';

export function createAdminRoutes(sql: Sql) {
  const app = new Hono();

  /**
   * List all pending users waiting for admin assignment
   */
  app.get('/pending-users', async (c) => {
    const pending = await sql`
      SELECT 
        id,
        phone_number,
        full_name,
        onboarded_at,
        created_at
      FROM members
      WHERE status = 'pending'
      ORDER BY onboarded_at DESC
    `;

    return c.json(pending);
  });

  /**
   * List all members with their status
   */
  app.get('/members', async (c) => {
    const members = await sql`
      SELECT 
        m.id,
        m.phone_number,
        m.full_name,
        m.status,
        m.domain,
        m.onboarded_at,
        m.created_at,
        n.name as office_name,
        p.name as last_project_name
      FROM members m
      LEFT JOIN nodes n ON m.company_id = n.id
      LEFT JOIN projects p ON m.last_confirmed_project_id = p.id
      ORDER BY m.created_at DESC
    `;

    return c.json(members);
  });

  /**
   * Assign a pending user to an office and optionally a project
   */
  app.post('/assign-user', async (c) => {
    const body = await getRequestBody(c);
    const { userId, nodeId, projectId, fullName } = body;

    // Validate inputs
    if (!userId || !nodeId) {
      return c.json({ error: 'userId and nodeId are required' }, 400);
    }

    // Get node info to get domain
    const nodes = await sql`
      SELECT id, name, domain FROM nodes WHERE id = ${nodeId}
    `;

    if (nodes.length === 0) {
      return c.json({ error: 'Invalid nodeId' }, 400);
    }

    const node = nodes[0];

    // Update member
    await sql`
      UPDATE members
      SET 
        company_id = ${nodeId},
        full_name = ${fullName || 'Field Worker'},
        status = 'active',
        domain = ${node.domain || 'construction'}
      WHERE id = ${userId}
    `;

    // Optionally set last confirmed project
    if (projectId) {
      await sql`
        UPDATE members
        SET 
          last_confirmed_project_id = ${projectId},
          project_confirmed_at = NOW()
        WHERE id = ${userId}
      `;
    }

    // Get updated member
    const members = await sql`
      SELECT * FROM members WHERE id = ${userId}
    `;

    const member = members[0];

    // Send welcome message
    const project = projectId ? await sql`SELECT name FROM projects WHERE id = ${projectId}` : [];
    const projectName = project.length > 0 ? project[0].name : 'various projects';

    const welcomeMessage = `🎉 You're all set, ${fullName || 'there'}!

You're now assigned to: ${node.name}
Project: ${projectName}

Start sending me:
📸 Photos of your work
🎙️ Voice notes describing what you did
⏱️ How many hours it took

I'll track everything automatically. Let's go! 🚀`;

    await sendTwilioMessage(member.phone_number, welcomeMessage, 'whatsapp');

    return c.json({
      success: true,
      member: {
        id: member.id,
        phoneNumber: member.phone_number,
        fullName: member.full_name,
        status: member.status,
        office: node.name,
        project: projectName
      }
    });
  });

  /**
   * Get all offices (nodes)
   */
  app.get('/offices', async (c) => {
    const offices = await sql`
      SELECT id, name, domain
      FROM nodes
      ORDER BY name ASC
    `;

    return c.json(offices);
  });

  /**
   * Get all projects for an office
   */
  app.get('/offices/:nodeId/projects', async (c) => {
    const nodeId = parseInt(c.req.param('nodeId'));

    const projects = await sql`
      SELECT id, name, node_id
      FROM projects
      WHERE node_id = ${nodeId}
      ORDER BY name ASC
    `;

    return c.json(projects);
  });

  return app;
}
