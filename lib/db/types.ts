/**
 * Database adapter interface.
 * Implement this to connect any database backend (SQLite, Postgres, etc.)
 */
export interface DbAdapter {
    /** Query rows from a table */
    query<T = Record<string, unknown>>(table: string, options?: QueryOptions): Promise<T[]>;
    /** Insert or upsert a row */
    upsert(table: string, row: Record<string, unknown>, onConflict?: string): Promise<Record<string, unknown> | null>;
    /** Update a row by ID */
    update(table: string, id: string, updates: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    /** Delete a row by ID */
    remove(table: string, id: string): Promise<boolean>;
    /** Whether a real database is connected */
    configured: boolean;
}

export interface QueryOptions {
    select?: string;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
}

/**
 * Auth adapter interface (optional — only needed for remote access).
 */
export interface AuthAdapter {
    getUser(): Promise<{ email: string } | null>;
    signIn(email: string, password: string): Promise<{ error?: string }>;
    signOut(): Promise<void>;
    configured: boolean;
}
