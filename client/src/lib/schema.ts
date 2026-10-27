/* =============================================================================
 * DATABASE SCHEMA (v2, sync-ready)
 * Shared by the app (client/src/lib/sync.ts), the tests and seed/seed.py.
 *
 * Every row carries:
 *   updated_at  ms timestamp of the last edit, set by the editing device.
 *               Decides which edit wins when two devices changed the same row.
 *   synced_at   ms timestamp of the moment the row was uploaded, set by the
 *               SERVER. Devices download only rows uploaded since their last
 *               sync, so a device with a wrong clock can never miss changes.
 *   deleted     tombstone flag. Rows are never physically removed, otherwise
 *               other devices could not learn about the deletion.
 *
 * Balances are not stored per device: a tab's balance is the sum of its live
 * ledger entries. Ledger entries are only ever added or deleted, so offline
 * edits made on two devices always merge without losing money.
 * The account.balance column is still kept up to date on the server for the
 * seed script and for anyone reading the database directly.
 * ============================================================================= */

/** Current server time in epoch milliseconds, evaluated inside the database. */
export const NOW_MS = `CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;

export const SCHEMA_VERSION = 2;

const accountTable = (name: string) => `CREATE TABLE ${name} (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'card',
    balance REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
    deleted INTEGER NOT NULL DEFAULT 0,
    synced_at INTEGER NOT NULL DEFAULT (${NOW_MS})
)`;

const transactionTable = (name: string) => `CREATE TABLE ${name} (
    id INTEGER PRIMARY KEY,
    account_id INTEGER,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    date_added TEXT NOT NULL DEFAULT 'not timed',
    created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
    updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
    deleted INTEGER NOT NULL DEFAULT 0,
    synced_at INTEGER NOT NULL DEFAULT (${NOW_MS})
)`;

const settingsTable = (name: string) => `CREATE TABLE ${name} (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
    synced_at INTEGER NOT NULL DEFAULT (${NOW_MS})
)`;

const INDEXES = [
    `CREATE INDEX IF NOT EXISTS account_synced_at ON account (synced_at)`,
    `CREATE INDEX IF NOT EXISTS transaction_synced_at ON "transaction" (synced_at)`,
    `CREATE INDEX IF NOT EXISTS transaction_account_id ON "transaction" (account_id)`,
    `CREATE INDEX IF NOT EXISTS settings_synced_at ON settings (synced_at)`,
];

/**
 * Compatibility with app versions before offline support (<= 1.1.0), which
 * write the database directly: hard deletes become tombstones, new ledger rows
 * are linked to their tab by name, and renames get a fresh upload time so
 * synced devices notice them.
 */
const LEGACY_TRIGGERS = [
    `CREATE TRIGGER IF NOT EXISTS legacy_transaction_link AFTER INSERT ON "transaction"
        WHEN NEW.account_id IS NULL AND NEW.category IS NOT NULL
        BEGIN
            UPDATE "transaction" SET account_id = (
                SELECT a.id FROM account a WHERE a.name = NEW.category AND a.deleted = 0 ORDER BY a.id DESC LIMIT 1
            ) WHERE id = NEW.id;
        END`,
    `CREATE TRIGGER IF NOT EXISTS legacy_transaction_delete AFTER DELETE ON "transaction"
        BEGIN
            INSERT INTO "transaction" (id, account_id, title, amount, category, date_added, created_at, updated_at, deleted, synced_at)
            VALUES (OLD.id, OLD.account_id, OLD.title, OLD.amount, OLD.category, OLD.date_added, OLD.created_at, ${NOW_MS}, 1, ${NOW_MS});
        END`,
    `CREATE TRIGGER IF NOT EXISTS legacy_account_delete AFTER DELETE ON account
        BEGIN
            INSERT INTO account (id, name, icon, balance, updated_at, deleted, synced_at)
            VALUES (OLD.id, OLD.name, OLD.icon, 0, ${NOW_MS}, 1, ${NOW_MS});
        END`,
    `CREATE TRIGGER IF NOT EXISTS legacy_account_edit AFTER UPDATE OF name, icon ON account
        WHEN NEW.synced_at = OLD.synced_at AND (NEW.name IS NOT OLD.name OR NEW.icon IS NOT OLD.icon)
        BEGIN
            UPDATE account SET updated_at = ${NOW_MS}, synced_at = ${NOW_MS} WHERE id = NEW.id;
        END`,
];

/** Recomputes the informational account.balance column from the ledger. */
export const RECOMPUTE_BALANCES_SQL = `UPDATE account SET balance = COALESCE((
    SELECT SUM(t.amount) FROM "transaction" t WHERE t.account_id = account.id AND t.deleted = 0
), 0)`;

/** Fresh, empty database. */
export const CREATE_V2: string[] = [
    accountTable('account'),
    transactionTable('"transaction"'),
    settingsTable('settings'),
    ...INDEXES,
    ...LEGACY_TRIGGERS,
];

/**
 * Upgrades a v1 database (the original Flask / app 1.0-1.1 layout) in place.
 * Runs as one transactional batch: either everything moves or nothing does.
 * Ledger rows are linked to their tab by id, and if any stored balance is not
 * explained by its ledger, a "Balance carried over" entry makes up the
 * difference so no tab changes value.
 */
export const MIGRATE_V1_TO_V2: string[] = [
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,

    accountTable('account_v2'),
    `INSERT INTO account_v2 (id, name, icon, balance, updated_at, deleted, synced_at)
        SELECT id, name, COALESCE(icon, 'card'), balance, ${NOW_MS}, 0, ${NOW_MS} FROM account`,

    transactionTable('transaction_v2'),
    `INSERT INTO transaction_v2 (id, account_id, title, amount, category, date_added, created_at, updated_at, deleted, synced_at)
        SELECT t.id, (SELECT a.id FROM account a WHERE a.name = t.category), t.title, t.amount, t.category,
               COALESCE(t.date_added, 'not timed'), t.id, ${NOW_MS}, 0, ${NOW_MS}
        FROM "transaction" t`,
    `INSERT INTO transaction_v2 (account_id, title, amount, category, date_added, created_at, updated_at, deleted, synced_at)
        SELECT a.id, 'Balance carried over',
               a.balance - COALESCE((SELECT SUM(t.amount) FROM transaction_v2 t WHERE t.account_id = a.id), 0),
               a.name, 'not timed', 0, ${NOW_MS}, 0, ${NOW_MS}
        FROM account_v2 a
        WHERE ABS(a.balance - COALESCE((SELECT SUM(t.amount) FROM transaction_v2 t WHERE t.account_id = a.id), 0)) > 0.000001`,

    settingsTable('settings_v2'),
    `INSERT INTO settings_v2 (key, value, updated_at, synced_at) SELECT key, value, ${NOW_MS}, ${NOW_MS} FROM settings`,

    `DROP TABLE account`,
    `DROP TABLE "transaction"`,
    `DROP TABLE settings`,
    `ALTER TABLE account_v2 RENAME TO account`,
    `ALTER TABLE transaction_v2 RENAME TO "transaction"`,
    `ALTER TABLE settings_v2 RENAME TO settings`,
    ...INDEXES,
    ...LEGACY_TRIGGERS,
];

export type SchemaState = 'empty' | 'v1' | 'v2';

/** Classifies a database from the column names of its `account` table. */
export function classifySchema(accountColumns: string[]): SchemaState {
    if (accountColumns.length === 0) return 'empty';
    return accountColumns.includes('synced_at') ? 'v2' : 'v1';
}
