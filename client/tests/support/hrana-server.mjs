// =============================================================================
// Minimal local stand-in for Turso, for tests only.
// Speaks the Hrana-over-HTTP v2 JSON protocol that @libsql/client and
// seed/seed.py use (GET /v2, POST /v2/pipeline: execute, batch, sequence,
// get_autocommit, close) on top of a plain SQLite file via node:sqlite.
//
//   node tests/support/hrana-server.mjs <port> <sqlite-file> [token]
// or import { startHranaServer } from this module.
// =============================================================================

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

function decodeValue(v) {
    switch (v?.type) {
        case 'null': return null;
        case 'integer': return BigInt(v.value);
        case 'float': return Number(v.value);
        case 'text': return String(v.value);
        case 'blob': return Buffer.from(v.base64, 'base64');
        default: throw new Error(`Unsupported value type ${v?.type}`);
    }
}

function encodeValue(v) {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'bigint') return { type: 'integer', value: v.toString() };
    if (typeof v === 'number') return { type: 'float', value: v };
    if (typeof v === 'string') return { type: 'text', value: v };
    if (v instanceof Uint8Array) return { type: 'blob', base64: Buffer.from(v).toString('base64') };
    return { type: 'text', value: String(v) };
}

function executeStmt(db, stmt, sqls) {
    const sql = stmt.sql ?? sqls.get(stmt.sql_id);
    if (typeof sql !== 'string') throw new Error(`Unknown sql_id ${stmt.sql_id}`);
    const prepared = db.prepare(sql);
    prepared.setReadBigInts(true);
    const args = (stmt.args ?? []).map(decodeValue);
    const named = Object.fromEntries((stmt.named_args ?? []).map((a) => [a.name.replace(/^[:@$]/, ''), decodeValue(a.value)]));
    const params = Object.keys(named).length ? [named, ...args] : args;
    const columns = prepared.columns();
    if (columns.length > 0) {
        prepared.setReturnArrays(true);
        const rows = prepared.all(...params);
        return {
            cols: columns.map((c) => ({ name: c.name, decltype: c.type ?? null })),
            rows: rows.map((r) => r.map(encodeValue)),
            affected_row_count: 0,
            last_insert_rowid: null,
        };
    }
    const info = prepared.run(...params);
    return {
        cols: [],
        rows: [],
        affected_row_count: Number(info.changes),
        last_insert_rowid: info.lastInsertRowid == null ? null : String(info.lastInsertRowid),
    };
}

function evalCond(db, cond, results, errors) {
    if (!cond) return true;
    switch (cond.type) {
        case 'ok': return results[cond.step] != null;
        case 'error': return errors[cond.step] != null;
        case 'not': return !evalCond(db, cond.cond, results, errors);
        case 'and': return cond.conds.every((c) => evalCond(db, c, results, errors));
        case 'or': return cond.conds.some((c) => evalCond(db, c, results, errors));
        case 'is_autocommit': return !db.isTransaction;
        default: throw new Error(`Unsupported condition ${cond.type}`);
    }
}

function handleRequest(db, req, sqls) {
    switch (req.type) {
        case 'execute':
            return { type: 'execute', result: executeStmt(db, req.stmt, sqls) };
        case 'batch': {
            const results = [];
            const errors = [];
            for (const step of req.batch.steps) {
                if (!evalCond(db, step.condition, results, errors)) {
                    results.push(null);
                    errors.push(null);
                    continue;
                }
                try {
                    results.push(executeStmt(db, step.stmt, sqls));
                    errors.push(null);
                } catch (e) {
                    results.push(null);
                    errors.push({ message: String(e.message), code: 'SQLITE_ERROR' });
                }
            }
            return { type: 'batch', result: { step_results: results, step_errors: errors } };
        }
        case 'sequence':
            db.exec(req.sql);
            return { type: 'sequence' };
        case 'store_sql':
            sqls.set(req.sql_id, req.sql);
            return { type: 'store_sql' };
        case 'close_sql':
            sqls.delete(req.sql_id);
            return { type: 'close_sql' };
        case 'get_autocommit':
            return { type: 'get_autocommit', is_autocommit: !db.isTransaction };
        case 'close':
            return { type: 'close' };
        default:
            throw new Error(`Unsupported request type ${req.type}`);
    }
}

/** Starts the server. Returns { url, close(), requests } where requests counts pipelines. */
export function startHranaServer({ port = 0, file = ':memory:', token = null } = {}) {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    const stats = { pipelines: 0 };
    const streams = new Map(); // baton -> stored SQL texts of that stream

    const server = createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        if (req.method === 'OPTIONS') return res.writeHead(204).end();
        if (token && req.headers.authorization !== `Bearer ${token}`) {
            return res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Unauthorized' }));
        }
        if (req.method === 'GET' && req.url === '/v2') return res.writeHead(200).end();
        if (req.method === 'POST' && req.url === '/v2/pipeline') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const { baton, requests } = JSON.parse(body);
            const sqls = (baton && streams.get(baton)) || new Map();
            if (baton) streams.delete(baton);
            stats.pipelines++;
            let closed = false;
            const results = requests.map((r) => {
                if (r.type === 'close') closed = true;
                try {
                    return { type: 'ok', response: handleRequest(db, r, sqls) };
                } catch (e) {
                    return { type: 'error', error: { message: String(e.message), code: 'SQLITE_ERROR' } };
                }
            });
            // Never leave a transaction open across HTTP requests.
            if (closed && db.isTransaction) db.exec('ROLLBACK');
            const next = closed ? null : randomUUID();
            if (next) streams.set(next, sqls);
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ baton: next, base_url: null, results }));
        }
        res.writeHead(404).end();
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            const url = `http://127.0.0.1:${server.address().port}`;
            resolve({
                url,
                db,
                stats,
                close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => { db.close(); r(); }); }),
            });
        });
    });
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1]?.endsWith('hrana-server.mjs')) {
    const [port, file, token] = process.argv.slice(2);
    startHranaServer({ port: Number(port || 8080), file: file || ':memory:', token: token || null }).then((s) => {
        console.log(`hrana test server listening on ${s.url} (${file || ':memory:'})`);
    });
}
