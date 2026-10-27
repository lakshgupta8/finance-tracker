// Offline sync tests. Run with:  npm test   (node --test tests/)
// Each test starts a local Turso stand-in and simulates one or more devices,
// each with its own local copy, that can be switched offline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createClient, type Client } from '@libsql/client';
import { startHranaServer } from './support/hrana-server.mjs';
import { SyncedRepo, ensureRemoteSchema } from '../src/lib/sync.ts';
import { MemoryStore } from '../src/lib/localStore.ts';

const TOKEN = 'test-token';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Device = { repo: SyncedRepo; store: MemoryStore; client: Client; online: boolean };
const liveDevices: Device[] = [];

function device(url: string, store = new MemoryStore(), token = TOKEN): Device {
    const d = { online: true } as Device;
    d.store = store;
    d.client = createClient({
        url,
        authToken: token,
        fetch: ((input: any, init?: any) => (d.online ? fetch(input, init) : Promise.reject(new TypeError('fetch failed')))) as any,
    });
    d.repo = new SyncedRepo(store, d.client);
    liveDevices.push(d);
    return d;
}

async function boot(d: Device) {
    await d.repo.init();
    return d;
}

const balances = (d: Device) => Object.fromEntries(d.repo.getView().accounts.map((a) => [a.name, a.balance]));

async function withServer(fn: (url: string, server: Awaited<ReturnType<typeof startHranaServer>>) => Promise<void>) {
    const server = await startHranaServer({ token: TOKEN });
    try {
        await fn(server.url, server);
    } finally {
        liveDevices.splice(0).forEach((d) => d.repo.stop()); // cancel queued background syncs
        await server.close();
    }
}

test('two devices editing offline merge without losing money', () => withServer(async (url) => {
    const a = await boot(device(url));
    await a.repo.addAccount('Wallet', 1000, 'wallet');
    await a.repo.sync();
    assert.equal(a.repo.getStatus().state, 'idle');
    assert.equal(a.repo.getStatus().pending, 0);

    const b = await boot(device(url));
    await b.repo.sync();
    assert.deepEqual(balances(b), { Wallet: 1000 });
    const walletId = b.repo.getView().accounts[0].id;

    a.online = false;
    b.online = false;
    await a.repo.adjustAccount(walletId, -50, 'tea');
    await b.repo.adjustAccount(walletId, -30, 'bus');
    await a.repo.sync();
    await b.repo.sync();
    assert.equal(a.repo.getStatus().state, 'offline');
    assert.equal(a.repo.getStatus().pending, 1);
    assert.deepEqual(balances(a), { Wallet: 950 }, 'offline edit applies locally at once');

    a.online = true;
    b.online = true;
    await a.repo.sync();
    await b.repo.sync();
    await a.repo.sync();
    assert.deepEqual(balances(a), { Wallet: 920 });
    assert.deepEqual(balances(b), { Wallet: 920 });
    assert.deepEqual(
        a.repo.getView().transactions.map((t) => t.title).sort(),
        ['Initial setup balance', 'bus', 'tea'],
    );
}));

test('renames: the most recent edit wins, even if it uploads first', () => withServer(async (url) => {
    const a = await boot(device(url));
    await a.repo.addAccount('Cash', 0, 'wallet');
    await a.repo.sync();
    const b = await boot(device(url));
    await b.repo.sync();
    const id = a.repo.getView().accounts[0].id;

    a.online = false;
    await a.repo.updateAccount(id, 'Older name', 'wallet');
    await sleep(15);
    await b.repo.updateAccount(id, 'Newer name', 'bank');
    await b.repo.sync(); // newer edit reaches the server first

    a.online = true;
    await a.repo.sync(); // older edit is rejected by the server and replaced locally
    await b.repo.sync();
    for (const d of [a, b]) {
        const acc = d.repo.getView().accounts[0];
        assert.equal(acc.name, 'Newer name');
        assert.equal(acc.icon, 'bank');
        assert.equal(d.repo.getStatus().pending, 0);
    }
}));

test('deletions win and propagate, and ledger rows of a deleted tab disappear', () => withServer(async (url) => {
    const a = await boot(device(url));
    await a.repo.addAccount('Old tab', 200, 'card');
    await a.repo.addAccount('Keep', 5, 'card');
    await a.repo.sync();
    const b = await boot(device(url));
    await b.repo.sync();
    const oldId = a.repo.getView().accounts.find((x) => x.name === 'Old tab')!.id;

    b.online = false;
    await a.repo.deleteAccount(oldId);
    await a.repo.sync();
    await sleep(15);
    await b.repo.updateAccount(oldId, 'Renamed later', 'card'); // newer edit, but tab was deleted
    b.online = true;
    await b.repo.sync();
    await a.repo.sync();

    for (const d of [a, b]) {
        assert.deepEqual(balances(d), { Keep: 5 });
        assert.ok(!d.repo.getView().transactions.some((t) => t.category === 'Old tab' || t.category === 'Renamed later'));
    }

    const txId = a.repo.getView().transactions[0].id;
    await a.repo.deleteTransaction(txId);
    await a.repo.sync();
    await b.repo.sync();
    assert.deepEqual(balances(b), { Keep: 0 });
}));

test('unsynced changes survive an app restart and upload later', () => withServer(async (url) => {
    const store = new MemoryStore();
    const a = await boot(device(url, store));
    await a.repo.addAccount('Bank', 100, 'bank');
    await a.repo.sync();
    const id = a.repo.getView().accounts[0].id;

    a.online = false;
    await a.repo.adjustAccount(id, 25, 'refund');
    await a.repo.saveLayout([[id]]);
    a.repo.stop();

    const restarted = await boot(device(url, store)); // same local copy, new process
    assert.deepEqual(balances(restarted), { Bank: 125 });
    assert.equal(restarted.repo.getStatus().pending, 2);
    await restarted.repo.sync();
    assert.equal(restarted.repo.getStatus().pending, 0);

    const fresh = await boot(device(url));
    await fresh.repo.sync();
    assert.deepEqual(balances(fresh), { Bank: 125 });
    assert.deepEqual(fresh.repo.getView().layout, [[id]]);
}));

test('a device with a wrong clock still delivers its changes (pull uses upload time)', () => withServer(async (url) => {
    const b = await boot(device(url));
    await b.repo.addAccount('Shared', 0, 'card');
    await b.repo.sync();
    await b.repo.sync(); // B's cursor is now "current"

    const a = await boot(device(url));
    await a.repo.sync();
    const id = a.repo.getView().accounts[0].id;
    const realNow = Date.now;
    Date.now = () => realNow() - 3 * 24 * 3600 * 1000; // A's clock is 3 days behind
    try {
        await a.repo.adjustAccount(id, 70, 'from skewed device');
    } finally {
        Date.now = realNow;
    }
    await a.repo.sync();
    await b.repo.sync();
    assert.deepEqual(balances(b), { Shared: 70 });
}));

test('status reports offline and bad credentials', () => withServer(async (url) => {
    const bad = await boot(device(url, new MemoryStore(), 'wrong-token'));
    await bad.repo.sync();
    assert.equal(bad.repo.getStatus().state, 'error');
    assert.match(bad.repo.getStatus().error ?? '', /credentials/);

    const off = await boot(device(url));
    off.online = false;
    await off.repo.addAccount('Offline tab', 10, 'card');
    await off.repo.sync();
    assert.equal(off.repo.getStatus().state, 'offline');
    assert.deepEqual(balances(off), { 'Offline tab': 10 });
}));

test('rejects duplicate names among live tabs', () => withServer(async (url) => {
    const a = await boot(device(url));
    await a.repo.addAccount('Cash', 0, 'card');
    await assert.rejects(a.repo.addAccount('Cash', 0, 'card'), /already exists/);
    const id = a.repo.getView().accounts[0].id;
    await a.repo.deleteAccount(id);
    await a.repo.addAccount('Cash', 0, 'card'); // allowed again once deleted
}));

// ---------------------------------------------------------------- migration

function createV1(db: DatabaseSync) {
    db.exec(`
        CREATE TABLE account (id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, balance FLOAT NOT NULL, icon VARCHAR(20), PRIMARY KEY (id), UNIQUE (name));
        CREATE TABLE "transaction" (id INTEGER NOT NULL, title VARCHAR(100) NOT NULL, amount FLOAT NOT NULL, category VARCHAR(50), date_added VARCHAR(50) DEFAULT 'not timed', PRIMARY KEY (id));
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
}

test('upgrades an existing v1 database without changing any balance', () => withServer(async (url, server) => {
    createV1(server.db);
    server.db.exec(`
        INSERT INTO account VALUES (1, 'MyOnline', 120, '💳'), (2, 'MyCash', 40, 'wallet'), (3, 'Drifted', 75, 'bank');
        INSERT INTO "transaction" VALUES
            (1, 'Initial setup balance', 100, 'MyOnline', 'not timed'),
            (2, 'salary', 50, 'MyOnline', '01 Sep 2026, 10:00 AM'),
            (3, 'tea', -30, 'MyOnline', '02 Sep 2026, 10:00 AM'),
            (4, 'Initial setup balance', 40, 'MyCash', 'not timed'),
            (5, 'Initial setup balance', 50, 'Drifted', 'not timed'),
            (6, 'misc', 7, 'General', 'not timed');
        INSERT INTO settings VALUES ('tab_layout', '[[1,2],[3]]');
    `);

    const a = await boot(device(url));
    await a.repo.sync();
    assert.equal(a.repo.getStatus().state, 'idle', a.repo.getStatus().error ?? '');
    // Drifted's stored 75 is not explained by its ledger (50): a carry-over entry keeps it at 75.
    assert.deepEqual(balances(a), { MyOnline: 120, MyCash: 40, Drifted: 75 });
    assert.deepEqual(a.repo.getView().layout, [[1, 2], [3]]);
    const titles = a.repo.getView().transactions.map((t) => t.title);
    assert.deepEqual(titles.slice(0, 2), ['misc', 'Initial setup balance']); // newest (highest id) first
    assert.ok(titles.includes('Balance carried over'));
    assert.equal(titles.length, 7);

    // Running the check again on an upgraded database is a no-op.
    assert.equal(await ensureRemoteSchema(a.client), 'v2');

    // Server-side informational balances stay correct after new edits.
    await a.repo.adjustAccount(1, -20, 'snack');
    await a.repo.sync();
    const row = server.db.prepare('SELECT balance FROM account WHERE id = 1').get() as { balance: number };
    assert.equal(row.balance, 100);
}));

test('writes from the old app version (before offline support) still reach synced devices', () => withServer(async (url, server) => {
    const a = await boot(device(url));
    await a.repo.addAccount('Cash', 100, 'wallet');
    await a.repo.sync();
    const id = a.repo.getView().accounts[0].id;
    const firstTx = a.repo.getView().transactions[0].id;

    // Exactly what app 1.1.0 runs against the database:
    server.db.exec(`UPDATE account SET balance = balance + -40 WHERE id = ${id}`);
    server.db.exec(`INSERT INTO "transaction" (title, amount, category, date_added) VALUES ('old phone spend', -40, 'Cash', '27 Oct 2026, 09:00 AM')`);
    server.db.exec(`UPDATE account SET name = 'Cash box', icon = 'coins' WHERE id = ${id}`);
    server.db.exec(`DELETE FROM "transaction" WHERE id = ${firstTx}`);

    await a.repo.sync();
    assert.deepEqual(balances(a), { 'Cash box': -40 }, 'initial 100 deleted, -40 spend counted, rename seen');
    assert.deepEqual(a.repo.getView().transactions.map((t) => [t.title, t.category]), [['old phone spend', 'Cash box']]);

    server.db.exec(`DELETE FROM "transaction" WHERE category = 'Cash box'; DELETE FROM account WHERE id = ${id}`);
    await a.repo.sync();
    assert.deepEqual(balances(a), {}, 'tab deleted by the old app disappears');
}));

const SEED = new URL('../../seed/data.db', import.meta.url);
test('upgrades a copy of the real seed data with identical balances', { skip: !existsSync(SEED) && 'seed/data.db not present' }, () => withServer(async (url, server) => {
    const src = new DatabaseSync(fileURLToPath(SEED), { readOnly: true });
    const accounts = src.prepare('SELECT id, name, balance, icon FROM account').all() as any[];
    const txs = src.prepare('SELECT id, title, amount, category, date_added FROM "transaction"').all() as any[];
    src.close();

    createV1(server.db);
    const insA = server.db.prepare('INSERT INTO account VALUES (?, ?, ?, ?)');
    accounts.forEach((r) => insA.run(r.id, r.name, r.balance, r.icon));
    const insT = server.db.prepare('INSERT INTO "transaction" VALUES (?, ?, ?, ?, ?)');
    txs.forEach((r) => insT.run(r.id, r.title, r.amount, r.category, r.date_added));

    const a = await boot(device(url));
    await a.repo.sync();
    assert.equal(a.repo.getStatus().state, 'idle', a.repo.getStatus().error ?? '');
    assert.deepEqual(balances(a), Object.fromEntries(accounts.map((r) => [r.name, r.balance])));
    assert.equal(a.repo.getView().transactions.length, txs.length);
}));
