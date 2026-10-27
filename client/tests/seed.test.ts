// Runs seed/seed.py against the local Turso stand-in, then syncs a device.
// Skipped when Python is not available.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { startHranaServer } from './support/hrana-server.mjs';
import { SyncedRepo } from '../src/lib/sync.ts';
import { MemoryStore } from '../src/lib/localStore.ts';

const SEED_SCRIPT = fileURLToPath(new URL('../../seed/seed.py', import.meta.url));
const python = ['python', 'python3', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);

// Must be asynchronous: the test server runs in this same process.
function runSeed(url: string, db: string, ...extra: string[]): Promise<{ code: number | null; out: string }> {
    return new Promise((resolve) => {
        const p = spawn(python!, [SEED_SCRIPT, '--url', url, '--token', 'tok', '--db', db, ...extra]);
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (out += d));
        p.on('close', (code) => resolve({ code, out }));
    });
}

test('seed.py fills an empty database, refuses to overwrite, and the app upgrades it', { skip: !python && 'python not found' }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mt-seed-'));
    const local = join(dir, 'old.db');
    const src = new DatabaseSync(local);
    src.exec(`
        CREATE TABLE account (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, balance REAL NOT NULL, icon TEXT);
        CREATE TABLE "transaction" (id INTEGER PRIMARY KEY, title TEXT NOT NULL, amount REAL NOT NULL, category TEXT, date_added TEXT);
        INSERT INTO account VALUES (1, 'Bank', 150, 'bank'), (2, 'Wallet', 20, 'wallet');
        INSERT INTO "transaction" VALUES (1, 'Initial setup balance', 200, 'Bank', 'not timed'),
                                         (2, 'rent', -50, 'Bank', '01 Oct 2026, 09:00 AM'),
                                         (3, 'Initial setup balance', 20, 'Wallet', 'not timed');
    `);
    src.close();

    const server = await startHranaServer({ token: 'tok' });
    try {
        const first = await runSeed(server.url, local);
        assert.equal(first.code, 0, first.out);
        assert.match(first.out, /2 accounts and 3 transactions; combined balance = 170\.00/);

        const again = await runSeed(server.url, local);
        assert.notEqual(again.code, 0, 'refuses a non-empty database without --wipe');
        assert.match(again.out, /Re-run with --wipe/);

        const client = createClient({ url: server.url, authToken: 'tok' });
        const repo = new SyncedRepo(new MemoryStore(), client);
        await repo.init();
        await repo.sync();
        assert.equal(repo.getStatus().state, 'idle', repo.getStatus().error ?? '');
        assert.deepEqual(repo.getView().accounts.map((a) => [a.name, a.balance]), [['Bank', 150], ['Wallet', 20]]);

        // --wipe also works on a database the app has already upgraded.
        const wiped = await runSeed(server.url, local, '--wipe');
        assert.equal(wiped.code, 0, wiped.out);
        assert.match(wiped.out, /Disconnect, then connect again/);
        repo.stop();
    } finally {
        await server.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
