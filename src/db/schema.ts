import { pgTable, serial, text, decimal, integer, timestamp, varchar } from 'drizzle-orm/pg-core';

// 1. NODES (formerly companies)
export const nodes = pgTable('nodes', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    // Storing currency as string/decimal is safer for math
    defaultHourlyRate: decimal('default_hourly_rate', { precision: 10, scale: 2 }).default('85.00'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 2. MEMBERS (formerly users/Foremen)
export const members = pgTable('members', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    phoneNumber: varchar('phone_number', { length: 20 }).unique().notNull(),
    fullName: text('full_name'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 3. TXNS (formerly change_orders)
export const txns = pgTable('txns', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    userId: integer('user_id').references(() => members.id),

    // Input
    rawText: text('raw_text'),
    imageUrl: text('image_url'),

    // Output (AI & Billing)
    scopeDescription: text('scope_description'),
    estimatedRevenue: decimal('estimated_revenue', { precision: 10, scale: 2 }),
    status: varchar('status', { length: 20 }).default('PROCESSING'),

    createdAt: timestamp('created_at').defaultNow(),
});

// 4. RATE CARDS
export const rateCards = pgTable('rate_cards', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => nodes.id),
    positionName: text('position_name').notNull(),
    hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});