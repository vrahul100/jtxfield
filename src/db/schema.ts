import { pgTable, serial, text, decimal, integer, timestamp, varchar, boolean, pgPolicy, uuid, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 1. NODES (formerly companies)
export const nodes = pgTable('nodes', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    companyCode: varchar('company_code', { length: 10 }).unique(),
    defaultHourlyRate: decimal('default_hourly_rate', { precision: 10, scale: 2 }).default('85.00'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 2. MEMBERS (formerly users/Foremen)
export const members = pgTable('members', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    phoneNumber: varchar('phone_number', { length: 20 }).notNull().unique(),
    fullName: varchar('full_name', { length: 100 }),
    languagePreference: varchar('language_preference', { length: 10 }).default('en'), // en, es, etc.
    domain: varchar('domain', { length: 50 }),
    role: varchar('role', { length: 50 }).default('General Labor'),

    // Onboarding
    status: varchar('status', { length: 20 }).default('pending'), // pending, active, inactive
    onboardedAt: timestamp('onboarded_at'),
    invitedBy: integer('invited_by'), // User ID who invited
    pendingNodeId: integer('pending_node_id').references(() => nodes.id), // Node the member is being invited to join

    // Last confirmed project logic
    lastConfirmedProjectId: integer('last_confirmed_project_id').references((): any => projects.id),
    projectConfirmedAt: timestamp('project_confirmed_at'),
    pendingCorrection: text('pending_correction'),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 3. PROJECTS
export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
    nodeId: integer('node_id').references(() => nodes.id).notNull(),
    name: text('name').notNull(),
    aliases: text('aliases'), // JSON array of project name variations for fuzzy matching
    radius: integer('radius'), // Enforcement radius in meters
    isInbox: boolean('is_inbox').default(false), // Permanent "Inbox" project per node
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 4. BUCKETS - Message accumulation before processing
// Status: open → closed → processing → completed | failed | holding
export const buckets = pgTable('buckets', {
    id: serial('id').primaryKey(),
    memberId: integer('member_id').references(() => members.id).notNull(),
    nodeId: integer('node_id').references(() => nodes.id).notNull(),
    projectId: integer('project_id').references(() => projects.id),

    type: varchar('type', { length: 30 }).default('regular'), // regular | change_order | non_scope

    // Message data (accumulated)
    source: varchar('source', { length: 20 }).notNull(), // 'sms' | 'whatsapp'
    fromPhone: varchar('from_phone', { length: 20 }).notNull(),
    rawText: text('raw_text'),           // Text content (appended if multiple messages)
    imageUrls: text('image_urls'),       // JSON array of image URLs
    audioUrls: text('audio_urls'),       // JSON array of audio URLs
    transcripts: text('transcripts'),    // JSON array of transcripts

    // AI Extraction
    domain: varchar('domain', { length: 50 }),
    intent: varchar('intent', { length: 50 }),
    projectNameRaw: text('project_name_raw'),
    suspectedProjectName: text('suspected_project_name'), // AI-extracted project tag for Inbox sorting

    // Status: open | closed | processing | completed | failed | holding
    status: varchar('status', { length: 50 }).default('open').notNull(),

    // Validation
    validationErrors: text('validation_errors'),  // JSON array of issues
    validationAttempts: integer('validation_attempts').default(0), // Consistency check retries
    aiResponse: text('ai_response'),
    extractedData: text('extracted_data'),

    // Twilio tracking
    messageSids: text('message_sids'),   // JSON array of Twilio message SIDs
    waSentTimestamp: timestamp('wa_sent_timestamp'),
    waReceivedTimestamp: timestamp('wa_received_timestamp'),
    potentialChange: boolean('potential_change').default(false),
    hours: decimal('hours', { precision: 10, scale: 2 }), // Extracted hours for editing

    // Flags & auditing
    isFlagged: boolean('is_flagged').default(false),
    flagType: varchar('flag_type', { length: 50 }),
    flagCategory: varchar('flag_category', { length: 50 }),
    flagReason: text('flag_reason'),
    flagResolution: varchar('flag_resolution', { length: 50 }),
    coPacketId: integer('co_packet_id'),
    reviewedBy: integer('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),

    // Location
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),
    address: text('address'),

    // Legacy DB columns missing from schema
    summary: text('summary'),
    extractionJson: text('extraction_json'),
    conversationHistory: text('conversation_history'),
    clarityScore: integer('clarity_score'),
    lastQuestionType: varchar('last_question_type', { length: 50 }),
    conversationState: varchar('conversation_state', { length: 50 }),
    stateAttempts: integer('state_attempts').default(0),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 5. TXNS - Completed transactions from closed buckets
export const txns = pgTable('txns', {
    id: serial('id').primaryKey(),
    bucketId: integer('bucket_id').references(() => buckets.id),
    companyId: integer('company_id').references(() => nodes.id),
    userId: integer('user_id').references(() => members.id),
    projectId: integer('project_id').references(() => projects.id),

    job: text('job'),                    // AI-inferred work description from bucket
    evidence: text('evidence'),          // JSON array of media URLs (images + audio)

    scopeDescription: text('scope_description'),
    location: text('location'),
    estimatedRevenue: decimal('estimated_revenue', { precision: 10, scale: 2 }),
    time: decimal('time', { precision: 10, scale: 2 }),
    labor: text('labor'),
    material: text('material'),
    potentialChange: boolean('potential_change').default(false),
    status: varchar('status', { length: 20 }).default('PROCESSING'),

    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 6. RATE CARDS
export const rateCards = pgTable('rate_cards', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    positionName: text('position_name').notNull(),
    hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 7. HOLDING TANK - Unknown users
export const holdingTank = pgTable('holding_tank', {
    id: serial('id').primaryKey(),
    fromPhone: varchar('from_phone', { length: 20 }).notNull(),
    source: varchar('source', { length: 20 }).notNull(),
    rawText: text('raw_text'),
    imageUrls: text('image_urls'),
    audioUrls: text('audio_urls'),
    messageSid: varchar('message_sid', { length: 50 }),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending | reviewed | rejected
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});
// 8. USERS - Web dashboard authentication
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 10 }).notNull(), // 'OM' (Office Manager) | 'SU' (Super User)
    nodeId: integer('node_id').references(() => nodes.id), // null for SU, required for OM
    fullName: varchar('full_name', { length: 100 }),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 9. SESSIONS
export const sessions = pgTable('sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: integer('user_id').references(() => users.id).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 10. CO PACKETS
export const coPackets = pgTable('co_packets', {
    id: serial('id').primaryKey(),
    nodeId: integer('node_id').references(() => nodes.id).notNull(),
    title: text('title').notNull(),
    gcContact: text('gc_contact'),
    status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, submitted, approved, rejected, paid
    coverNote: text('cover_note'),
    markup: decimal('markup', { precision: 5, scale: 2 }),
    pdfUrl: text('pdf_url'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 11. WEEKLY TIMESHEETS
export const weeklyTimesheets = pgTable('weekly_timesheets', {
    id: serial('id').primaryKey(),
    memberId: integer('member_id').references(() => members.id).notNull(),
    nodeId: integer('node_id').references(() => nodes.id).notNull(),
    weekStartDate: timestamp('week_start_date').notNull(),
    totalHours: decimal('total_hours', { precision: 10, scale: 2 }).default('0'),
    billableHours: decimal('billable_hours', { precision: 10, scale: 2 }).default('0'),
    nonScopeHours: decimal('non_scope_hours', { precision: 10, scale: 2 }).default('0'),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, approved
    approvedBy: integer('approved_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

// 12. INTEGRATION INTEREST
export const integrationInterest = pgTable('integration_interest', {
    id: serial('id').primaryKey(),
    companyName: text('company_name'),
    userEmail: varchar('user_email', { length: 255 }),
    integrationName: varchar('integration_name', { length: 100 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        pgPolicy("Enable full access for service_role", {
            for: "all",
            to: "service_role",
            using: sql`true`,
            withCheck: sql`true`
        })
    ]
});

