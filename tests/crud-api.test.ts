import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import postgres from 'postgres';

// Use test database
const sql = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jtxfield', {
    max: 1,
});

const app = createApp(sql);

// Test helper to make requests
async function request(method: string, path: string, body?: any, cookies?: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (cookies) {
        headers['Cookie'] = cookies;
    }

    const req = new Request(`http://localhost${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    return app.fetch(req);
}

// Store session cookie for authenticated requests
let sessionCookie = '';

describe('CRUD API Tests', () => {
    beforeAll(async () => {
        // Login as test user to get session
        const response = await request('POST', '/api/auth/login', {
            email: 'su@test.com',
            password: 'password123',
        });

        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
            sessionCookie = setCookie.split(';')[0];
        }

        console.log('Session cookie:', sessionCookie ? 'obtained' : 'NOT obtained');
    });

    afterAll(async () => {
        await sql.end();
    });

    // ============================================
    // AUTH TESTS
    // ============================================
    describe('Auth API', () => {
        it('GET /api/auth/session without auth returns 401', async () => {
            const res = await request('GET', '/api/auth/session');
            expect(res.status).toBe(401);
        });

        it('POST /api/auth/login with invalid credentials returns 401', async () => {
            const res = await request('POST', '/api/auth/login', {
                email: 'invalid@test.com',
                password: 'wrongpassword',
            });
            expect(res.status).toBe(401);
        });
    });

    // ============================================
    // WORKLOG TESTS
    // ============================================
    describe('Work Tickets API', () => {
        it('GET /api/worklog without auth returns 401', async () => {
            const res = await request('GET', '/api/worklog');
            expect(res.status).toBe(401);
        });

        it('GET /api/worklog with auth returns 200', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/worklog', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('buckets');
            expect(data).toHaveProperty('total');
            expect(data).toHaveProperty('page');
            expect(data).toHaveProperty('totalPages');
        });

        it('GET /api/worklog with pagination params returns paginated data', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/worklog?page=1&limit=5', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.page).toBe(1);
            expect(data.limit).toBe(5);
        });

        it('GET /api/worklog with search param returns filtered data', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/worklog?search=test', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('buckets');
        });
    });

    // ============================================
    // MEMBERS TESTS
    // ============================================
    describe('Members API', () => {
        let testMemberId: number;
        const testPhone = '+1555' + Date.now().toString().slice(-7);

        it('GET /api/members without auth returns 401', async () => {
            const res = await request('GET', '/api/members');
            expect(res.status).toBe(401);
        });

        it('GET /api/members with auth returns 200', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/members', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('members');
            expect(data).toHaveProperty('total');
            expect(data).toHaveProperty('page');
            expect(data).toHaveProperty('totalPages');
        });

        it('GET /api/members with pagination returns paginated data', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/members?page=1&limit=10', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.page).toBe(1);
            expect(data.limit).toBe(10);
        });

        it('GET /api/members with search returns filtered data', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/members?search=test', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('members');
        });

        it('POST /api/members without phone returns 400', async () => {
            if (!sessionCookie) return;
            const res = await request('POST', '/api/members', {
                fullName: 'Test User',
                // missing phoneNumber
            }, sessionCookie);
            expect(res.status).toBe(400);
        });

        it('POST /api/members creates a member', async () => {
            if (!sessionCookie) return;
            const res = await request('POST', '/api/members', {
                fullName: 'Test Member',
                phoneNumber: testPhone,
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('member');
            expect(data.member).toHaveProperty('id');
            testMemberId = data.member.id;
        });

        it('PUT /api/members/:id updates full name only', async () => {
            if (!sessionCookie || !testMemberId) return;
            const res = await request('PUT', `/api/members/${testMemberId}`, {
                fullName: 'Updated Member Name',
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.member.full_name).toBe('Updated Member Name');
        });

        it('PUT /api/members/:id updates language only', async () => {
            if (!sessionCookie || !testMemberId) return;
            const res = await request('PUT', `/api/members/${testMemberId}`, {
                language: 'es',
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.member.language).toBe('es');
        });

        it('PUT /api/members/:id updates domain only', async () => {
            if (!sessionCookie || !testMemberId) return;
            const res = await request('PUT', `/api/members/${testMemberId}`, {
                domain: 'recovery',
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.member.domain).toBe('recovery');
        });

        it('PUT /api/members/:id updates multiple fields', async () => {
            if (!sessionCookie || !testMemberId) return;
            const res = await request('PUT', `/api/members/${testMemberId}`, {
                fullName: 'Multi Update Test',
                language: 'en',
                domain: 'construction',
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.member.full_name).toBe('Multi Update Test');
            expect(data.member.language).toBe('en');
            expect(data.member.domain).toBe('construction');
        });

        it('PUT /api/members/:id with empty body still returns 200', async () => {
            if (!sessionCookie || !testMemberId) return;
            const res = await request('PUT', `/api/members/${testMemberId}`, {}, sessionCookie);
            expect(res.status).toBe(200);
        });

        it('PUT /api/members/:id with non-existent id returns 404', async () => {
            if (!sessionCookie) return;
            const res = await request('PUT', '/api/members/999999', {
                fullName: 'Should Fail',
            }, sessionCookie);
            expect(res.status).toBe(404);
        });

        it('DELETE /api/members/:id deletes member', async () => {
            if (!sessionCookie || !testMemberId) return;
            const res = await request('DELETE', `/api/members/${testMemberId}`, undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
        });

        it('DELETE /api/members/:id with non-existent id returns 404', async () => {
            if (!sessionCookie) return;
            const res = await request('DELETE', '/api/members/999999', undefined, sessionCookie);
            expect(res.status).toBe(404);
        });
    });

    // ============================================
    // PROJECTS TESTS
    // ============================================
    describe('Projects API', () => {
        let testProjectId: number;

        it('GET /api/projects without auth returns 401', async () => {
            const res = await request('GET', '/api/projects');
            expect(res.status).toBe(401);
        });

        it('GET /api/projects with auth returns 200', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/projects', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('projects');
            expect(data).toHaveProperty('total');
            expect(data).toHaveProperty('page');
            expect(data).toHaveProperty('totalPages');
        });

        it('GET /api/projects with search returns filtered data', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/projects?search=test', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('projects');
        });

        it('POST /api/projects creates a project', async () => {
            if (!sessionCookie) return;
            const res = await request('POST', '/api/projects', {
                name: 'Test Project ' + Date.now(),
                nodeId: 1,
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('project');
            expect(data.project).toHaveProperty('id');
            testProjectId = data.project.id;
        });

        it('PUT /api/projects/:id updates a project', async () => {
            if (!sessionCookie || !testProjectId) return;
            const res = await request('PUT', `/api/projects/${testProjectId}`, {
                name: 'Updated Test Project',
                aliases: ['alias1', 'alias2'],
            }, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.project.name).toBe('Updated Test Project');
        });

        it('DELETE /api/projects/:id soft-deletes a project', async () => {
            if (!sessionCookie || !testProjectId) return;
            const res = await request('DELETE', `/api/projects/${testProjectId}`, undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
        });
    });

    // ============================================
    // NODES TESTS (SU only)
    // ============================================
    describe('Nodes API', () => {
        it('GET /api/nodes without auth returns 401', async () => {
            const res = await request('GET', '/api/nodes');
            expect(res.status).toBe(401);
        });

        it('GET /api/nodes with SU auth returns 200', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/nodes', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('nodes');
        });
    });

    // ============================================
    // USERS TESTS (SU only)
    // ============================================
    describe('Users API', () => {
        it('GET /api/users without auth returns 401', async () => {
            const res = await request('GET', '/api/users');
            expect(res.status).toBe(401);
        });

        it('GET /api/users with SU auth returns 200', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/users', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('users');
        });
    });

    // ============================================
    // INBOX TESTS
    // ============================================
    describe('Inbox API', () => {
        it('GET /api/inbox/:nodeId without auth returns 401', async () => {
            const res = await request('GET', '/api/inbox/1');
            expect(res.status).toBe(401);
        });

        it('GET /api/inbox/:nodeId with auth returns 200', async () => {
            if (!sessionCookie) return;
            const res = await request('GET', '/api/inbox/1', undefined, sessionCookie);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('nodeId');
            expect(data).toHaveProperty('entries');
        });
    });
});
