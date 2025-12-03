import { pgTable, serial, text, decimal, integer, timestamp, varchar } from 'drizzle-orm/pg-core';

// 1. COMPANIES
export const companies = pgTable('companies', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    // Storing currency as string/decimal is safer for math
    defaultHourlyRate: decimal('default_hourly_rate', { precision: 10, scale: 2 }).default('85.00'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 2. USERS (Foremen)
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => companies.id),
    phoneNumber: varchar('phone_number', { length: 20 }).unique().notNull(),
    fullName: text('full_name'),
    createdAt: timestamp('created_at').defaultNow(),
});

// 3. CHANGE ORDERS
export const changeOrders = pgTable('change_orders', {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => companies.id),
    userId: integer('user_id').references(() => users.id),

    // Input
    rawText: text('raw_text'),
    imageUrl: text('image_url'),

    // Output (AI & Billing)
    scopeDescription: text('scope_description'),
    estimatedRevenue: decimal('estimated_revenue', { precision: 10, scale: 2 }),
    status: varchar('status', { length: 20 }).default('PROCESSING'),

    createdAt: timestamp('created_at').defaultNow(),
});