/* =============================================================================
 * LOCAL COPY
 * The device keeps a full copy of the database so the app works offline.
 * In the apps this lives in IndexedDB (persistent in both the Electron and the
 * Android WebView). Tests use the in-memory implementation.
 * ============================================================================= */

export type Flag = 0 | 1;

export type AccountRow = {
    id: number;
    name: string;
    icon: string;
    updated_at: number;
    deleted: Flag;
    /** 1 while this device has a change the server has not accepted yet. */
    dirty: Flag;
};

export type TransactionRow = {
    id: number;
    account_id: number | null;
    title: string;
    amount: number;
    category: string | null;
    date_added: string;
    created_at: number;
    updated_at: number;
    deleted: Flag;
    dirty: Flag;
};

export type SettingRow = {
    key: string;
    value: string;
    updated_at: number;
    dirty: Flag;
};

export type SyncMeta = {
    /** Highest server upload time (synced_at) this device has downloaded. */
    cursor: number;
    /** Server time of the last successful sync, for display. */
    lastSyncedAt: number | null;
};

export type LocalSnapshot = {
    accounts: AccountRow[];
    transactions: TransactionRow[];
    settings: SettingRow[];
    meta: SyncMeta;
};

export type LocalChanges = {
    accounts?: AccountRow[];
    transactions?: TransactionRow[];
    settings?: SettingRow[];
    meta?: SyncMeta;
};

export interface LocalStore {
    load(): Promise<LocalSnapshot>;
    write(changes: LocalChanges): Promise<void>;
    /** Removes the whole local copy. */
    destroy(): Promise<void>;
}

export const EMPTY_META: SyncMeta = { cursor: 0, lastSyncedAt: null };

// -----------------------------------------------------------------------------
// In-memory (tests)
// -----------------------------------------------------------------------------

export class MemoryStore implements LocalStore {
    accounts = new Map<number, AccountRow>();
    transactions = new Map<number, TransactionRow>();
    settings = new Map<string, SettingRow>();
    meta: SyncMeta = { ...EMPTY_META };

    async load(): Promise<LocalSnapshot> {
        return {
            accounts: [...this.accounts.values()].map((r) => ({ ...r })),
            transactions: [...this.transactions.values()].map((r) => ({ ...r })),
            settings: [...this.settings.values()].map((r) => ({ ...r })),
            meta: { ...this.meta },
        };
    }

    async write(c: LocalChanges): Promise<void> {
        c.accounts?.forEach((r) => this.accounts.set(r.id, { ...r }));
        c.transactions?.forEach((r) => this.transactions.set(r.id, { ...r }));
        c.settings?.forEach((r) => this.settings.set(r.key, { ...r }));
        if (c.meta) this.meta = { ...c.meta };
    }

    async destroy(): Promise<void> {
        this.accounts.clear();
        this.transactions.clear();
        this.settings.clear();
        this.meta = { ...EMPTY_META };
    }
}

// -----------------------------------------------------------------------------
// IndexedDB (apps)
// -----------------------------------------------------------------------------

const STORES = ['accounts', 'transactions', 'settings', 'meta'] as const;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

export class IndexedDbStore implements LocalStore {
    private dbPromise: Promise<IDBDatabase> | null = null;
    private readonly name: string;

    constructor(name: string) {
        this.name = name;
    }

    private open(): Promise<IDBDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(this.name, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                req.onblocked = () => reject(new Error('Local database is open in another window.'));
            });
        }
        return this.dbPromise;
    }

    async load(): Promise<LocalSnapshot> {
        const db = await this.open();
        const tx = db.transaction([...STORES], 'readonly');
        const [accounts, transactions, settings, meta] = await Promise.all([
            promisify(tx.objectStore('accounts').getAll() as IDBRequest<AccountRow[]>),
            promisify(tx.objectStore('transactions').getAll() as IDBRequest<TransactionRow[]>),
            promisify(tx.objectStore('settings').getAll() as IDBRequest<SettingRow[]>),
            promisify(tx.objectStore('meta').get('sync') as IDBRequest<SyncMeta | undefined>),
        ]);
        return { accounts, transactions, settings, meta: meta ?? { ...EMPTY_META } };
    }

    async write(c: LocalChanges): Promise<void> {
        const db = await this.open();
        const tx = db.transaction([...STORES], 'readwrite');
        c.accounts?.forEach((r) => tx.objectStore('accounts').put(r));
        c.transactions?.forEach((r) => tx.objectStore('transactions').put(r));
        c.settings?.forEach((r) => tx.objectStore('settings').put(r));
        if (c.meta) tx.objectStore('meta').put(c.meta, 'sync');
        await done(tx);
    }

    async destroy(): Promise<void> {
        if (this.dbPromise) {
            (await this.dbPromise).close();
            this.dbPromise = null;
        }
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(this.name);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () => resolve();
        });
    }
}

/** One local database per remote database, so switching databases never mixes data. */
export function localStoreNameFor(url: string): string {
    return `money-tabs:${url.trim().toLowerCase()}`;
}
