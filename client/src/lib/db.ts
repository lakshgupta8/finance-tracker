/* =============================================================================
 * DATA ACCESS LAYER
 * Direct SQL access to the shared hosted Turso/libSQL database. This replaces
 * the former Flask REST API; every former endpoint maps to one function below.
 * Multi-statement writes run inside a single transactional batch so balances
 * and the audit ledger can never drift apart.
 * ============================================================================= */

import { createClient, type Client, type InStatement, type Row } from '@libsql/client/web';
import type { Account, Transaction } from '../types';
import type { DbConfig } from './config';

let client: Client | null = null;

export function connect(cfg: DbConfig): Client {
    client = createClient({ url: cfg.url, authToken: cfg.authToken });
    return client;
}

export function disconnect() {
    client?.close();
    client = null;
}

function db(): Client {
    if (!client) throw new Error('Database is not connected.');
    return client;
}

export const SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        balance REAL NOT NULL DEFAULT 0,
        icon TEXT DEFAULT 'card'
    )`,
    `CREATE TABLE IF NOT EXISTS "transaction" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        date_added TEXT NOT NULL DEFAULT 'not timed'
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,
];

/** Creates the tables on a fresh database. Safe to call on every startup. */
export async function ensureSchema() {
    await db().batch(SCHEMA_SQL, 'write');
}

/** Verifies the credentials actually reach the database. */
export async function ping() {
    await db().execute('SELECT 1');
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

/** Mirrors the old backend's Python strftime('%d %b %Y, %I:%M %p'). */
export function formatNow(date = new Date()): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(date.getDate()).padStart(2, '0');
    const mon = months[date.getMonth()];
    const yyyy = date.getFullYear();
    let h = date.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const hh = String(h).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${dd} ${mon} ${yyyy}, ${hh}:${mm} ${ampm}`;
}

function rowToAccount(r: Row): Account {
    return {
        id: Number(r.id),
        name: String(r.name),
        balance: Number(r.balance),
        icon: r.icon == null ? 'card' : String(r.icon),
    };
}

function rowToTransaction(r: Row): Transaction {
    return {
        id: Number(r.id),
        title: String(r.title),
        amount: Number(r.amount),
        category: r.category == null ? 'General' : String(r.category),
        date_added: r.date_added == null ? 'not timed' : String(r.date_added),
    };
}

function friendlyError(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(msg)) {
        return new Error('A place of money with this name already exists');
    }
    if (/Failed to fetch|NetworkError|ECONN|ENOTFOUND|Load failed/i.test(msg)) {
        return new Error('Could not reach the database. Check your internet connection.');
    }
    if (/401|403|Unauthorized|forbidden|invalid.*token|jwt/i.test(msg)) {
        return new Error('Database rejected the credentials. Re-enter the URL and token in Database settings.');
    }
    return new Error(msg);
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        console.error(err);
        throw friendlyError(err);
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT / PLACE MANAGEMENT
// -----------------------------------------------------------------------------

export function getAccounts(): Promise<Account[]> {
    return run(async () => {
        const rs = await db().execute('SELECT id, name, balance, icon FROM account ORDER BY id');
        return rs.rows.map(rowToAccount);
    });
}

export function addAccount(name: string, balance: number, icon: string): Promise<void> {
    return run(async () => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Place/Account name cannot be empty');
        if (!Number.isFinite(balance)) throw new Error('Initial balance must be a valid finite numeric value');

        const stmts: InStatement[] = [
            { sql: 'INSERT INTO account (name, balance, icon) VALUES (?, ?, ?)', args: [trimmed, balance, icon] },
        ];
        if (balance !== 0) {
            stmts.push({
                sql: 'INSERT INTO "transaction" (title, amount, category, date_added) VALUES (?, ?, ?, ?)',
                args: ['Initial setup balance', balance, trimmed, formatNow()],
            });
        }
        await db().batch(stmts, 'write');
    });
}

/** Erases a tab together with its ledger rows. */
export function deleteAccount(id: number): Promise<void> {
    return run(async () => {
        await db().batch([
            { sql: 'DELETE FROM "transaction" WHERE category = (SELECT name FROM account WHERE id = ?)', args: [id] },
            { sql: 'DELETE FROM account WHERE id = ?', args: [id] },
        ], 'write');
    });
}

/** Renames / re-icons a tab and cascades the new name into the ledger. */
export function updateAccount(id: number, name: string, icon: string): Promise<void> {
    return run(async () => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Place/Account name cannot be empty');
        const rs = await db().batch([
            { sql: 'UPDATE "transaction" SET category = ? WHERE category = (SELECT name FROM account WHERE id = ?)', args: [trimmed, id] },
            { sql: 'UPDATE account SET name = ?, icon = ? WHERE id = ?', args: [trimmed, icon, id] },
        ], 'write');
        if (rs[1].rowsAffected === 0) throw new Error('Account/Place not found');
    });
}

/** Core +/- adjustment; updates the balance and leaves an audit trail atomically. */
export function adjustAccount(id: number, amount: number, note: string): Promise<void> {
    return run(async () => {
        if (!Number.isFinite(amount)) throw new Error('Adjustment amount must be a valid finite number');
        const title = note.trim() || (amount >= 0 ? 'Added funds' : 'Spent funds');
        const rs = await db().batch([
            { sql: 'UPDATE account SET balance = balance + ? WHERE id = ?', args: [amount, id] },
            {
                sql: 'INSERT INTO "transaction" (title, amount, category, date_added) SELECT ?, ?, name, ? FROM account WHERE id = ?',
                args: [title, amount, formatNow(), id],
            },
        ], 'write');
        if (rs[0].rowsAffected === 0) throw new Error('Account/Place not found');
    });
}

// -----------------------------------------------------------------------------
// TRANSACTION / LEDGER TRACE LOG
// -----------------------------------------------------------------------------

export function getTransactions(): Promise<Transaction[]> {
    return run(async () => {
        const rs = await db().execute('SELECT id, title, amount, category, date_added FROM "transaction" ORDER BY id DESC');
        return rs.rows.map(rowToTransaction);
    });
}

/** Removes a trace entry and reverts its effect on the matching tab. */
export function deleteTransaction(id: number): Promise<void> {
    return run(async () => {
        await db().batch([
            {
                sql: `UPDATE account SET balance = balance - (SELECT amount FROM "transaction" WHERE id = ?)
                      WHERE name = (SELECT category FROM "transaction" WHERE id = ?)`,
                args: [id, id],
            },
            { sql: 'DELETE FROM "transaction" WHERE id = ?', args: [id] },
        ], 'write');
    });
}

// -----------------------------------------------------------------------------
// SETTINGS (shared across devices) - tab grouping / order layout
// -----------------------------------------------------------------------------

const LAYOUT_KEY = 'tab_layout';

export function getLayout(): Promise<number[][] | null> {
    return run(async () => {
        const rs = await db().execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [LAYOUT_KEY] });
        if (rs.rows.length === 0) return null;
        try {
            const parsed = JSON.parse(String(rs.rows[0].value));
            return Array.isArray(parsed) ? (parsed as number[][]) : null;
        } catch {
            return null;
        }
    });
}

export function saveLayout(layout: number[][]): Promise<void> {
    return run(async () => {
        await db().execute({
            sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            args: [LAYOUT_KEY, JSON.stringify(layout)],
        });
    });
}
