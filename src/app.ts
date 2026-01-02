import { Hono } from 'hono'
import { Sql } from 'postgres'
import { serveStatic } from '@hono/node-server/serve-static'
import { handleTwilioWebhook } from './controllers/webhook.js'
import { createAdminRoutes } from './controllers/admin.js'
import { getInbox, bulkAssign, addAlias } from './controllers/inbox.js'
import { login, logout, checkSession } from './controllers/auth.js'
import { getWorklog, approveBucket, updateBucket, rejectBucket } from './controllers/worklog.js'
import { getMembers, approveMember, inviteMember, updateMember, deleteMember, resendConfirmation } from './controllers/members.js'
import { getProjects, createProject, updateProject, deleteProject } from './controllers/projects.js'
import { getNodes, createNode, updateNode, deleteNode } from './controllers/nodes.js'
import { getUsersList, createNewUser, updateUserInfo, deleteUser } from './controllers/users.js'
import { getTransactions } from './controllers/transactions.js'
import { requireAuth, requireOM, requireSU } from './middleware/auth.js'

export const createApp = (sql: Sql) => {
    const app = new Hono()

    // 0. STATIC FILES (for test fixtures)
    app.get('/test-fixtures/*', serveStatic({
        root: './tests/fixtures',
        rewriteRequestPath: (path) => path.replace(/^\/test-fixtures/, '')
    }))

    // 1. TWILIO WEBHOOK (public)
    app.post('/twhook', (c) => handleTwilioWebhook(c, sql))

    // 2. AUTH API (public)
    app.post('/api/auth/login', (c) => login(c, sql))
    app.post('/api/auth/logout', (c) => logout(c))
    app.get('/api/auth/session', (c) => checkSession(c, sql))

    app.get('/api/worklog', requireOM(sql), (c) => getWorklog(c, sql))
    app.post('/api/worklog/:id/approve', requireOM(sql), (c) => approveBucket(c, sql))
    app.post('/api/worklog/:id/reject', requireOM(sql), (c) => rejectBucket(c, sql))
    app.put('/api/worklog/:id', requireOM(sql), (c) => updateBucket(c, sql))

    // 4. MEMBERS API (OM & SU)
    app.get('/api/members', requireOM(sql), (c) => getMembers(c, sql))
    app.post('/api/members/:id/approve', requireOM(sql), (c) => approveMember(c, sql))
    app.post('/api/members/:id/resend-confirmation', requireOM(sql), (c) => resendConfirmation(c, sql))
    app.post('/api/members', requireOM(sql), (c) => inviteMember(c, sql))
    app.put('/api/members/:id', requireOM(sql), (c) => updateMember(c, sql))
    app.delete('/api/members/:id', requireOM(sql), (c) => deleteMember(c, sql))


    // 5. PROJECTS API (OM & SU)
    app.get('/api/projects', requireOM(sql), (c) => getProjects(c, sql))
    app.post('/api/projects', requireOM(sql), (c) => createProject(c, sql))
    app.put('/api/projects/:id', requireOM(sql), (c) => updateProject(c, sql))
    app.delete('/api/projects/:id', requireOM(sql), (c) => deleteProject(c, sql))

    // 6. TRANSACTIONS API (OM & SU)
    app.get('/api/transactions', requireOM(sql), (c) => getTransactions(c, sql))

    // 7. NODES API (SU only)
    app.get('/api/nodes', requireSU(sql), (c) => getNodes(c, sql))
    app.post('/api/nodes', requireSU(sql), (c) => createNode(c, sql))
    app.put('/api/nodes/:id', requireSU(sql), (c) => updateNode(c, sql))
    app.delete('/api/nodes/:id', requireSU(sql), (c) => deleteNode(c, sql))

    // 7. USERS API (SU only)
    app.get('/api/users', requireSU(sql), (c) => getUsersList(c, sql))
    app.post('/api/users', requireSU(sql), (c) => createNewUser(c, sql))
    app.put('/api/users/:id', requireSU(sql), (c) => updateUserInfo(c, sql))
    app.delete('/api/users/:id', requireSU(sql), (c) => deleteUser(c, sql))

    // 8. INBOX API (OM & SU)
    app.get('/api/inbox/:nodeId', requireOM(sql), (c) => getInbox(c, sql))
    app.post('/api/inbox/bulk-assign', requireOM(sql), (c) => bulkAssign(c, sql))
    app.post('/api/inbox/add-alias', requireOM(sql), (c) => addAlias(c, sql))

    // 9. ADMIN API (legacy)
    app.route('/admin', createAdminRoutes(sql))

    return app
}
