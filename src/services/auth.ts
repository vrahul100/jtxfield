import { Sql } from 'postgres';
import bcrypt from 'bcryptjs';

export interface User {
    id: number;
    email: string;
    passwordHash: string;
    role: 'OM' | 'SU';
    nodeId: number | null;
    fullName: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Create a new user
 */
export async function createUser(
    sql: Sql,
    data: {
        email: string;
        password: string;
        role: 'OM' | 'SU';
        nodeId?: number | null;
        fullName?: string;
    }
): Promise<User> {
    const passwordHash = await hashPassword(data.password);

    const [user] = await sql`
        INSERT INTO users (email, password_hash, role, node_id, full_name, is_active)
        VALUES (
            ${data.email},
            ${passwordHash},
            ${data.role},
            ${data.nodeId || null},
            ${data.fullName || null},
            true
        )
        RETURNING *
    `;

    return user as User;
}

/**
 * Authenticate a user by email and password
 */
export async function authenticateUser(
    sql: Sql,
    email: string,
    password: string
): Promise<User | null> {
    const users = await sql`
        SELECT * FROM users 
        WHERE email = ${email} AND is_active = true
    `;

    if (users.length === 0) {
        return null;
    }

    const dbUser = users[0] as any; // Raw DB result
    const isValid = await verifyPassword(password, dbUser.password_hash); // Use snake_case

    if (!isValid) {
        return null;
    }

    // Map to camelCase User interface
    return {
        id: dbUser.id,
        email: dbUser.email,
        passwordHash: dbUser.password_hash,
        role: dbUser.role,
        nodeId: dbUser.node_id,
        fullName: dbUser.full_name,
        isActive: dbUser.is_active,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at,
    } as User;
}

/**
 * Get user by ID
 */
export async function getUserById(sql: Sql, userId: number): Promise<User | null> {
    const users = await sql`
        SELECT * FROM users WHERE id = ${userId} AND is_active = true
    `;

    if (users.length === 0) {
        return null;
    }

    const dbUser = users[0] as any;
    return {
        id: dbUser.id,
        email: dbUser.email,
        passwordHash: dbUser.password_hash,
        role: dbUser.role,
        nodeId: dbUser.node_id,
        fullName: dbUser.full_name,
        isActive: dbUser.is_active,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at,
    } as User;
}

/**
 * Get all users (SU only)
 */
export async function getUsers(sql: Sql): Promise<User[]> {
    const users = await sql`SELECT * FROM users ORDER BY created_at DESC`;
    return users.map((u: any) => ({
        id: u.id,
        email: u.email,
        passwordHash: u.password_hash,
        role: u.role,
        nodeId: u.node_id,
        fullName: u.full_name,
        isActive: u.is_active,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
    })) as User[];
}

/**
 * Update user
 */
export async function updateUser(
    sql: Sql,
    userId: number,
    data: Partial<Pick<User, 'email' | 'fullName' | 'nodeId' | 'isActive'>>
): Promise<User> {
    // Convert undefined to null for postgres.js compatibility
    const email = data.email ?? null;
    const fullName = data.fullName ?? null;
    const nodeId = data.nodeId ?? null;
    const isActive = data.isActive ?? null;

    const [user] = await sql`
        UPDATE users SET
            email = COALESCE(${email}, email),
            full_name = COALESCE(${fullName}, full_name),
            node_id = COALESCE(${nodeId}, node_id),
            is_active = COALESCE(${isActive}, is_active),
            updated_at = NOW()
        WHERE id = ${userId}
        RETURNING *
    `;

    return user as User;
}

/**
 * Update user password
 */
export async function updateUserPassword(
    sql: Sql,
    userId: number,
    newPassword: string
): Promise<void> {
    const passwordHash = await hashPassword(newPassword);

    await sql`
        UPDATE users SET
            password_hash = ${passwordHash},
            updated_at = NOW()
        WHERE id = ${userId}
    `;
}
