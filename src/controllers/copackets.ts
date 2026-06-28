import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';
import { getRequestBody } from '../utils/request.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/copackets
 */
export async function getCOPackets(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        
        let conditions = '';
        if (user.role === 'OM') {
            conditions = `WHERE node_id = ${user.nodeId}`;
        }
        
        const packets = await sql.unsafe(`
            SELECT * FROM co_packets
            ${conditions}
            ORDER BY created_at DESC
        `);
        
        return c.json({ packets });
    } catch (error: any) {
        console.error('[COPackets] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/copackets
 */
export async function createCOPacket(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const body = await getRequestBody(c);
        const { title, gcContact, coverNote, markup, bucketIds } = body;
        
        if (!title || !bucketIds || !bucketIds.length) {
            return c.json({ error: 'Title and bucketIds are required' }, 400);
        }
        
        const [packet] = await sql`
            INSERT INTO co_packets (node_id, title, gc_contact, status, cover_note, markup)
            VALUES (${user.nodeId}, ${title}, ${gcContact || null}, 'draft', ${coverNote || null}, ${markup || null})
            RETURNING *
        `;
        
        // Update buckets to link to this packet
        await sql`
            UPDATE buckets
            SET co_packet_id = ${packet.id}, status = 'submitted_co'
            WHERE id IN ${sql(bucketIds)}
            AND status != 'submitted_co'
        `;
        
        return c.json({ packet });
    } catch (error: any) {
        console.error('[COPackets] Create error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/copackets/:id/generate
 */
export async function generateCOPacketPDF(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const packetId = parseInt(c.req.param('id'));
        
        const [packet] = await sql`SELECT * FROM co_packets WHERE id = ${packetId} ${user.role === 'OM' ? sql`AND node_id = ${user.nodeId}` : sql``}`;
        if (!packet) return c.json({ error: 'Packet not found' }, 404);
        
        // Fetch tickets
        const tickets = await sql`
            SELECT b.*, m.full_name as member_name, p.name as project_name 
            FROM buckets b
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.co_packet_id = ${packetId}
        `;
        
        // Generate PDF using PDFKit
        const doc = new PDFDocument({ margin: 50 });
        const fileName = `co_packet_${packetId}_${Date.now()}.pdf`;
        
        const pdfDir = path.join(process.cwd(), 'frontend', 'public', 'pdfs');
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
        
        const pdfPath = path.join(pdfDir, fileName);
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);
        
        doc.fontSize(20).text(`Change Order Packet: ${packet.title}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`);
        if (packet.gc_contact) doc.text(`GC Contact: ${packet.gc_contact}`);
        if (packet.cover_note) doc.text(`Cover Note: ${packet.cover_note}`);
        doc.moveDown();
        
        doc.fontSize(16).text('Included Work Tickets:');
        doc.moveDown();
        
        let totalHours = 0;
        
        for (const t of tickets) {
            doc.fontSize(12).text(`Ticket ID: #${t.id} - Worker: ${t.member_name || 'Unknown'}`);
            doc.fontSize(10).text(`Project: ${t.project_name || 'Unknown'}`);
            doc.text(`Description: ${t.summary || t.transcripts || 'No description'}`);
            doc.text(`Hours: ${t.hours || 0}`);
            doc.moveDown();
            totalHours += parseFloat(t.hours || '0');
        }
        
        doc.moveDown();
        doc.fontSize(14).text(`Total Hours: ${totalHours.toFixed(2)}`);
        
        doc.end();
        
        await new Promise((resolve) => stream.on('finish', resolve));
        
        const pdfUrl = `/pdfs/${fileName}`;
        
        const [updated] = await sql`
            UPDATE co_packets SET pdf_url = ${pdfUrl}, status = 'submitted' WHERE id = ${packetId} RETURNING *
        `;
        
        return c.json({ packet: updated });
    } catch (error: any) {
        console.error('[COPackets] Generate error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
