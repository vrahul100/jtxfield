import { pgTable, serial, text, decimal, integer, timestamp, varchar, boolean } from 'drizzle-orm/pg-core';

// 1. NODES (formerly companies)
export const nodes = pgTable('nodes', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    defaultHourlyRate: decimal('default_hourly_rate', { precision: 10, scale: 2 }).default('85.00'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 2. MEMBERS (formerly users/Foremen)
export const members = pgTable('members', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    phoneNumber: varchar('phone_number', { length: 20 }).unique().notNull(),
    fullName: text('full_name'),
    domain: varchar('domain', { length: 50 }).default('construction'),
    // Last confirmed project (valid for 4 hours)
    lastConfirmedProjectId: integer('last_confirmed_project_id').references(() => projects.id),
    projectConfirmedAt: timestamp('project_confirmed_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 3. PROJECTS
export const projects = pgTable('projects', {
    id: serial('id').primaryKey(),
    nodeId: integer('node_id').references(() => nodes.id).notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
});

// 4. BUCKETS - Message accumulation before processing
// Status: open → closed → processing → completed | failed | holding
export const buckets = pgTable('buckets', {
    id: serial('id').primaryKey(),
    memberId: integer('member_id').references(() => members.id).notNull(),
    nodeId: integer('node_id').references(() => nodes.id).notNull(),
    projectId: integer('project_id').references(() => projects.id),

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

    // Status: open | closed | processing | completed | failed | holding
    status: varchar('status', { length: 20 }).default('open').notNull(),

    // Validation
    validationErrors: text('validation_errors'),  // JSON array of issues
    validationAttempts: integer('validation_attempts').default(0), // Consistency check retries
    aiResponse: text('ai_response'),

    // Twilio tracking
    messageSids: text('message_sids'),   // JSON array of Twilio message SIDs

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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
    estimatedRevenue: decimal('estimated_revenue', { precision: 10, scale: 2 }),
    status: varchar('status', { length: 20 }).default('PROCESSING'),

    createdAt: timestamp('created_at').defaultNow(),
});

// 6. RATE CARDS
export const rateCards = pgTable('rate_cards', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    positionName: text('position_name').notNull(),
    hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
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
});