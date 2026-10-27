/* =============================================================================
 * OFFLINE-FIRST REPOSITORY + SYNC ENGINE
 *
 * The UI reads and writes ONLY the local copy (see localStore.ts), so every
 * action works instantly with or without a connection. Changed rows are
 * flagged `dirty` and uploaded in the background.
 *
 * One sync round:
 *   1. push  upload every dirty row. The server keeps whichever version has the
 *            newer `updated_at` (last edit wins) and stamps accepted rows with
 *            its own clock in `synced_at` (the upload time).
 *   2. pull  download rows whose `synced_at` is newer than the last one this
 *            device has seen (minus a 60 s safety overlap), and merge them in.
 * Deletions are tombstones (`deleted = 1`) and always win, so a tab or ledger
 * entry deleted on one device never comes back from another.
 * ============================================================================= */

import type { Client, InStatement, Row } from '@libsql/client';
import type { Account, Transaction } from '../types';
import { CREATE_V2, MIGRATE_V1_TO_V2, NOW_MS, RECOMPUTE_BALANCES_SQL, classifySchema, type SchemaState } from './schema.ts';
import {
    EMPTY_META,
    type AccountRow, type Flag, type LocalStore, type SettingRow, type SyncMeta, type TransactionRow,
} from './localStore.ts';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncStatus = {
    state: SyncState;
    /** Local changes not yet accepted by the server. */
    pending: number;
    /** When this device last completed a sync (epoch ms), or null if never. */
    lastSyncedAt: number | null;
    error: string | null;
};

export type RepoView = {
    accounts: Account[];
    transactions: Transaction[];
    layout: number[][] | null;
    /** True until this device has completed its first download. */
    neverSynced: boolean;
};

const LAYOUT_KEY = 'tab_layout';
const PULL_OVERLAP_MS = 60_000;
const PUSH_CHUNK = 150;

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

/** Mirrors the old backend's Python strftime('%d %b %Y, %I:%M %p'). */
export function formatNow(date = new Date()): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dd = String(date.getDate()).padStart(2, '0');
    let h = date.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const hh = String(h).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${dd} ${months[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm} ${ampm}`;
}

function errorText(err: unknown): string {
    const parts: string[] = [];
    let e: any = err;
    for (let i = 0; e && i < 4; i++) {
        parts.push(String(e?.message ?? e));
        e = e?.cause;
    }
    return parts.join(' | ');
}

/** True when the failure means "no connection" rather than a real problem. */
export function isNetworkError(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return /fetch failed|failed to fetch|networkerror|load failed|network request failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|aborted/i
        .test(errorText(err));
}

export function friendlyError(err: unknown): string {
    const msg = errorText(err);
    if (isNetworkError(err)) return 'Could not reach the database. Check your internet connection.';
    if (/\b(401|403)\b|unauthori[sz]ed|forbidden|invalid.*token|jwt/i.test(msg)) {
        return 'Database rejected the credentials. Re-enter the URL and token in Database settings.';
    }
    return msg.split(' | ')[0];
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0));
const str = (v: unknown): string => (v == null ? '' : String(v));
const flag = (v: unknown): Flag => (num(v) ? 1 : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Creates the tables on an empty database, or upgrades a v1 database. */
export async function ensureRemoteSchema(client: Client): Promise<SchemaState> {
    const rs = await client.execute(`SELECT name FROM pragma_table_info('account')`);
    const state = classifySchema(rs.rows.map((r) => str(r.name)));
    if (state === 'empty') await client.batch(CREATE_V2, 'write');
    if (state === 'v1') await client.batch(MIGRATE_V1_TO_V2, 'write');
    return state;
}

// -----------------------------------------------------------------------------
// REPOSITORY
// -----------------------------------------------------------------------------

type Listener = () => void;
type Changes = { accounts: AccountRow[]; transactions: TransactionRow[]; settings: SettingRow[] };

export class SyncedRepo {
    private readonly store: LocalStore;
    private readonly client: Client | null;

    private accounts = new Map<number, AccountRow>();
    private transactions = new Map<number, TransactionRow>();
    private settings = new Map<string, SettingRow>();
    private meta: SyncMeta = { ...EMPTY_META };

    private listeners = new Set<Listener>();
    private view: RepoView | null = null;
    private status: SyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };

    /** Serialises local writes so a merge can never overwrite a newer edit. */
    private lock: Promise<unknown> = Promise.resolve();
    private inFlight: Promise<void> | null = null;
    private rerun = false;
    private schemaReady = false;
    private lastId = 0;

    private timer: ReturnType<typeof setTimeout> | null = null;
    private interval: ReturnType<typeof setInterval> | null = null;
    private detach: (() => void) | null = null;

    constructor(store: LocalStore, client: Client | null) {
        this.store = store;
        this.client = client;
    }

    async init(): Promise<void> {
        const snap = await this.store.load();
        snap.accounts.forEach((r) => this.accounts.set(r.id, r));
        snap.transactions.forEach((r) => this.transactions.set(r.id, r));
        snap.settings.forEach((r) => this.settings.set(r.key, r));
        this.meta = snap.meta;
        this.status = { ...this.status, lastSyncedAt: this.meta.lastSyncedAt, pending: this.countPending() };
        this.changed();
    }

    // ---------------------------------------------------------------- reading

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    getStatus(): SyncStatus {
        return this.status;
    }

    getView(): RepoView {
        if (this.view) return this.view;

        const liveAccounts = [...this.accounts.values()].filter((a) => !a.deleted);
        const accountById = new Map([...this.accounts.values()].map((a) => [a.id, a]));
        const balances = new Map<number, number>();
        const live: TransactionRow[] = [];

        for (const t of this.transactions.values()) {
            if (t.deleted) continue;
            const owner = t.account_id == null ? undefined : accountById.get(t.account_id);
            if (owner?.deleted) continue; // entries of a deleted tab disappear with it
            if (owner) balances.set(owner.id, (balances.get(owner.id) ?? 0) + t.amount);
            live.push(t);
        }
        live.sort((a, b) => (b.created_at - a.created_at) || (b.id - a.id));
        const transactions: Transaction[] = live.map((t) => {
            const owner = t.account_id == null ? undefined : accountById.get(t.account_id);
            return {
                id: t.id,
                title: t.title,
                amount: t.amount,
                // the tab's current name, so renames show up on old entries too
                category: owner ? owner.name : (t.category ?? 'General'),
                date_added: t.date_added,
            };
        });

        const accounts: Account[] = liveAccounts
            .sort((a, b) => a.id - b.id)
            .map((a) => ({ id: a.id, name: a.name, icon: a.icon, balance: round2(balances.get(a.id) ?? 0) }));

        let layout: number[][] | null = null;
        const layoutRow = this.settings.get(LAYOUT_KEY);
        if (layoutRow) {
            try {
                const parsed = JSON.parse(layoutRow.value);
                if (Array.isArray(parsed)) layout = parsed;
            } catch { /* ignore a corrupt layout */ }
        }

        this.view = { accounts, transactions, layout, neverSynced: this.meta.lastSyncedAt == null };
        return this.view;
    }

    // ---------------------------------------------------------------- writing

    async addAccount(name: string, balance: number, icon: string): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Place/Account name cannot be empty');
        if (!Number.isFinite(balance)) throw new Error('Initial balance must be a valid finite numeric value');
        await this.mutate(() => {
            this.assertUniqueName(trimmed);
            const now = Date.now();
            const account: AccountRow = { id: this.newId(), name: trimmed, icon, updated_at: now, deleted: 0, dirty: 1 };
            const txs: TransactionRow[] = balance !== 0 ? [this.newTransaction(account, balance, 'Initial setup balance', now)] : [];
            return { accounts: [account], transactions: txs };
        });
    }

    async updateAccount(id: number, name: string, icon: string): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('Place/Account name cannot be empty');
        await this.mutate(() => {
            const cur = this.liveAccount(id);
            this.assertUniqueName(trimmed, id);
            return { accounts: [{ ...cur, name: trimmed, icon, updated_at: this.bump(cur.updated_at), dirty: 1 }] };
        });
    }

    async deleteAccount(id: number): Promise<void> {
        await this.mutate(() => {
            const cur = this.liveAccount(id);
            return { accounts: [{ ...cur, deleted: 1, updated_at: this.bump(cur.updated_at), dirty: 1 }] };
        });
    }

    async adjustAccount(id: number, amount: number, note: string): Promise<void> {
        if (!Number.isFinite(amount)) throw new Error('Adjustment amount must be a valid finite number');
        await this.mutate(() => {
            const account = this.liveAccount(id);
            const title = note.trim() || (amount >= 0 ? 'Added funds' : 'Spent funds');
            return { transactions: [this.newTransaction(account, amount, title, Date.now())] };
        });
    }

    async deleteTransaction(id: number): Promise<void> {
        await this.mutate(() => {
            const cur = this.transactions.get(id);
            if (!cur || cur.deleted) throw new Error('Transaction not found');
            return { transactions: [{ ...cur, deleted: 1, updated_at: this.bump(cur.updated_at), dirty: 1 }] };
        });
    }

    async saveLayout(layout: number[][]): Promise<void> {
        const value = JSON.stringify(layout);
        await this.mutate(() => {
            const cur = this.settings.get(LAYOUT_KEY);
            if (cur?.value === value) return {};
            return { settings: [{ key: LAYOUT_KEY, value, updated_at: this.bump(cur?.updated_at), dirty: 1 }] };
        });
    }

    // ---------------------------------------------------------------- syncing

    /** Runs one sync round (or joins the running one). Never rejects; see getStatus(). */
    sync(): Promise<void> {
        if (!this.client) return Promise.resolve();
        if (this.inFlight) {
            this.rerun = true;
            return this.inFlight;
        }
        this.inFlight = (async () => {
            do {
                this.rerun = false;
                await this.syncOnce();
            } while (this.rerun);
        })().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    /** Background syncing: after edits, on reconnect, on focus and every 30 s. */
    startAutoSync(): void {
        if (typeof window === 'undefined' || this.detach) return;
        const kick = () => this.scheduleSync(0);
        const onVisible = () => { if (document.visibilityState === 'visible') kick(); };
        window.addEventListener('online', kick);
        document.addEventListener('visibilitychange', onVisible);
        this.interval = setInterval(() => {
            if (document.visibilityState === 'visible') this.sync();
        }, 30_000);
        this.detach = () => {
            window.removeEventListener('online', kick);
            document.removeEventListener('visibilitychange', onVisible);
        };
        kick();
    }

    stop(): void {
        this.detach?.();
        this.detach = null;
        if (this.interval) clearInterval(this.interval);
        if (this.timer) clearTimeout(this.timer);
        this.interval = this.timer = null;
        this.listeners.clear();
    }

    /** Stops syncing and deletes this device's offline copy (used on disconnect). */
    async destroyLocalCopy(): Promise<void> {
        this.stop();
        await this.lock;
        await this.store.destroy();
    }

    scheduleSync(delayMs = 400): void {
        if (!this.client) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            this.sync();
        }, delayMs);
    }

    private async syncOnce(): Promise<void> {
        const client = this.client!;
        this.setStatus({ state: 'syncing', error: null });
        try {
            if (!this.schemaReady) {
                await ensureRemoteSchema(client);
                this.schemaReady = true;
            }
            await this.push(client);
            const serverNow = await this.pull(client);
            await this.withLock(async () => {
                this.meta = { ...this.meta, lastSyncedAt: serverNow };
                await this.store.write({ meta: this.meta });
            });
            this.setStatus({ state: 'idle', error: null, lastSyncedAt: serverNow });
            this.changed();
        } catch (err) {
            const offline = isNetworkError(err);
            if (!offline) {
                console.error('Sync failed', err);
                this.schemaReady = false; // e.g. the database was reset: check its tables again next time
            }
            this.setStatus({ state: offline ? 'offline' : 'error', error: friendlyError(err) });
        }
    }

    private async push(client: Client): Promise<void> {
        type Item = { kind: 'account' | 'transaction' | 'setting'; key: number | string; updatedAt: number; stmt: InStatement };
        const items: Item[] = [];

        for (const a of this.accounts.values()) if (a.dirty) items.push({
            kind: 'account', key: a.id, updatedAt: a.updated_at, stmt: {
                sql: `INSERT INTO account (id, name, icon, updated_at, deleted, synced_at) VALUES (?, ?, ?, ?, ?, ${NOW_MS})
                      ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, updated_at = excluded.updated_at,
                          deleted = MAX(account.deleted, excluded.deleted), synced_at = excluded.synced_at
                      WHERE excluded.updated_at > account.updated_at OR excluded.deleted > account.deleted`,
                args: [a.id, a.name, a.icon, a.updated_at, a.deleted],
            },
        });
        for (const t of this.transactions.values()) if (t.dirty) items.push({
            kind: 'transaction', key: t.id, updatedAt: t.updated_at, stmt: {
                sql: `INSERT INTO "transaction" (id, account_id, title, amount, category, date_added, created_at, updated_at, deleted, synced_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW_MS})
                      ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, title = excluded.title, amount = excluded.amount,
                          category = excluded.category, date_added = excluded.date_added, created_at = excluded.created_at,
                          updated_at = excluded.updated_at, deleted = MAX("transaction".deleted, excluded.deleted), synced_at = excluded.synced_at
                      WHERE excluded.updated_at > "transaction".updated_at OR excluded.deleted > "transaction".deleted`,
                args: [t.id, t.account_id, t.title, t.amount, t.category, t.date_added, t.created_at, t.updated_at, t.deleted],
            },
        });
        for (const s of this.settings.values()) if (s.dirty) items.push({
            kind: 'setting', key: s.key, updatedAt: s.updated_at, stmt: {
                sql: `INSERT INTO settings (key, value, updated_at, synced_at) VALUES (?, ?, ?, ${NOW_MS})
                      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, synced_at = excluded.synced_at
                      WHERE excluded.updated_at > settings.updated_at`,
                args: [s.key, s.value, s.updated_at],
            },
        });
        if (items.length === 0) return;

        for (let i = 0; i < items.length; i += PUSH_CHUNK) {
            const chunk = items.slice(i, i + PUSH_CHUNK);
            const results = await client.batch([...chunk.map((c) => c.stmt), RECOMPUTE_BALANCES_SQL], 'write');

            // Rows the server kept its own (newer) version of: fetch that version.
            const rejected = { account: [] as number[], transaction: [] as number[], setting: [] as string[] };
            chunk.forEach((c, idx) => {
                if (results[idx].rowsAffected === 0) (rejected[c.kind] as (number | string)[]).push(c.key);
            });
            const refetch: InStatement[] = [];
            const qs = (n: number) => Array(n).fill('?').join(', ');
            if (rejected.account.length) refetch.push({ sql: `SELECT * FROM account WHERE id IN (${qs(rejected.account.length)})`, args: rejected.account });
            if (rejected.transaction.length) refetch.push({ sql: `SELECT * FROM "transaction" WHERE id IN (${qs(rejected.transaction.length)})`, args: rejected.transaction });
            if (rejected.setting.length) refetch.push({ sql: `SELECT * FROM settings WHERE key IN (${qs(rejected.setting.length)})`, args: rejected.setting });
            const fetched = refetch.length ? await client.batch(refetch, 'read') : [];

            await this.withLock(async () => {
                const out = { accounts: [] as AccountRow[], transactions: [] as TransactionRow[], settings: [] as SettingRow[] };
                // Clear `dirty` only if the row was not edited again while uploading.
                for (const c of chunk) {
                    if (c.kind === 'account') {
                        const r = this.accounts.get(c.key as number);
                        if (r?.dirty && r.updated_at === c.updatedAt) out.accounts.push({ ...r, dirty: 0 });
                    } else if (c.kind === 'transaction') {
                        const r = this.transactions.get(c.key as number);
                        if (r?.dirty && r.updated_at === c.updatedAt) out.transactions.push({ ...r, dirty: 0 });
                    } else {
                        const r = this.settings.get(c.key as string);
                        if (r?.dirty && r.updated_at === c.updatedAt) out.settings.push({ ...r, dirty: 0 });
                    }
                }
                await this.commit(out);
                for (const rs of fetched) await this.commit(this.mergeRemote(rs.rows, rs.columns));
            });
        }
    }

    /** Downloads rows uploaded since the last sync. Returns the server's clock. */
    private async pull(client: Client): Promise<number> {
        const since = Math.max(0, this.meta.cursor - PULL_OVERLAP_MS);
        const [acc, txs, sets, now] = await client.batch([
            { sql: `SELECT id, name, icon, updated_at, deleted, synced_at FROM account WHERE synced_at >= ?`, args: [since] },
            { sql: `SELECT id, account_id, title, amount, category, date_added, created_at, updated_at, deleted, synced_at FROM "transaction" WHERE synced_at >= ?`, args: [since] },
            { sql: `SELECT key, value, updated_at, synced_at FROM settings WHERE synced_at >= ?`, args: [since] },
            `SELECT ${NOW_MS} AS now`,
        ], 'read');

        await this.withLock(async () => {
            for (const rs of [acc, txs, sets]) await this.commit(this.mergeRemote(rs.rows, rs.columns));
            let cursor = this.meta.cursor;
            for (const rs of [acc, txs, sets]) for (const r of rs.rows) cursor = Math.max(cursor, num(r.synced_at));
            if (cursor !== this.meta.cursor) {
                this.meta = { ...this.meta, cursor };
                await this.store.write({ meta: this.meta });
            }
        });
        return num(now.rows[0].now);
    }

    /**
     * Decides, row by row, what the local copy should hold after seeing the
     * server's version. Must be called while holding the lock, and its result
     * committed before the lock is released.
     */
    private mergeRemote(rows: Row[], columns: string[]): Changes {
        const out: Changes = { accounts: [], transactions: [], settings: [] };
        if (rows.length === 0) return out;

        const pick = <T extends { updated_at: number; dirty: Flag; deleted?: Flag }>(local: T | undefined, remote: T): T | null => {
            if (!local) return remote;
            if (local.dirty && remote.updated_at <= local.updated_at) {
                // Keep the local edit (it will be uploaded), but a deletion always wins.
                if ('deleted' in local && remote.deleted && !local.deleted) return { ...local, deleted: 1 };
                return null;
            }
            const merged = 'deleted' in local ? { ...remote, deleted: (local.deleted || remote.deleted ? 1 : 0) as Flag } : remote;
            return JSON.stringify(merged) === JSON.stringify(local) ? null : merged;
        };

        if (columns.includes('key')) {
            for (const r of rows) {
                const remote: SettingRow = { key: str(r.key), value: str(r.value), updated_at: num(r.updated_at), dirty: 0 };
                const next = pick(this.settings.get(remote.key), remote);
                if (next) out.settings.push(next);
            }
        } else if (columns.includes('amount')) {
            for (const r of rows) {
                const remote: TransactionRow = {
                    id: num(r.id), account_id: r.account_id == null ? null : num(r.account_id), title: str(r.title),
                    amount: num(r.amount), category: r.category == null ? null : str(r.category),
                    date_added: str(r.date_added) || 'not timed', created_at: num(r.created_at),
                    updated_at: num(r.updated_at), deleted: flag(r.deleted), dirty: 0,
                };
                const next = pick(this.transactions.get(remote.id), remote);
                if (next) out.transactions.push(next);
            }
        } else {
            for (const r of rows) {
                const remote: AccountRow = {
                    id: num(r.id), name: str(r.name), icon: str(r.icon) || 'card',
                    updated_at: num(r.updated_at), deleted: flag(r.deleted), dirty: 0,
                };
                const next = pick(this.accounts.get(remote.id), remote);
                if (next) out.accounts.push(next);
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- internals

    private withLock<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.lock.then(fn);
        this.lock = run.catch(() => undefined);
        return run;
    }

    private async mutate(build: () => Partial<Changes>): Promise<void> {
        await this.withLock(async () => {
            const changes = build();
            await this.commit({ accounts: changes.accounts ?? [], transactions: changes.transactions ?? [], settings: changes.settings ?? [] });
        });
        this.scheduleSync();
    }

    /** Persists rows to the local store, then applies them in memory. */
    private async commit(c: Changes): Promise<void> {
        if (!c.accounts.length && !c.transactions.length && !c.settings.length) return;
        await this.store.write(c);
        c.accounts.forEach((r) => this.accounts.set(r.id, r));
        c.transactions.forEach((r) => this.transactions.set(r.id, r));
        c.settings.forEach((r) => this.settings.set(r.key, r));
        this.setStatus({ pending: this.countPending() });
        this.changed();
    }

    private liveAccount(id: number): AccountRow {
        const cur = this.accounts.get(id);
        if (!cur || cur.deleted) throw new Error('Account/Place not found');
        return cur;
    }

    private assertUniqueName(name: string, exceptId?: number): void {
        for (const a of this.accounts.values()) {
            if (!a.deleted && a.id !== exceptId && a.name === name) {
                throw new Error('A place of money with this name already exists');
            }
        }
    }

    private newTransaction(account: AccountRow, amount: number, title: string, now: number): TransactionRow {
        return {
            id: this.newId(), account_id: account.id, title, amount, category: account.name,
            date_added: formatNow(new Date(now)), created_at: now, updated_at: now, deleted: 0, dirty: 1,
        };
    }

    /** Collision-free across devices: milliseconds * 1000 + random, still a safe integer. */
    private newId(): number {
        let id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        if (id <= this.lastId) id = this.lastId + 1;
        this.lastId = id;
        return id;
    }

    private bump(prev?: number): number {
        return Math.max(Date.now(), (prev ?? 0) + 1);
    }

    private countPending(): number {
        let n = 0;
        for (const r of this.accounts.values()) n += r.dirty;
        for (const r of this.transactions.values()) n += r.dirty;
        for (const r of this.settings.values()) n += r.dirty;
        return n;
    }

    private setStatus(patch: Partial<SyncStatus>): void {
        this.status = { ...this.status, ...patch };
        this.listeners.forEach((fn) => fn());
    }

    private changed(): void {
        this.view = null;
        this.listeners.forEach((fn) => fn());
    }
}
