#!/usr/bin/env python3
"""
Seed the hosted Turso database with the data from the old local SQLite file.

Usage (from the repo root):
    python seed/seed.py --url libsql://money-tabs-you.turso.io --token eyJ...
    python seed/seed.py                       # reads TURSO_URL / TURSO_AUTH_TOKEN env vars

Options:
    --db PATH   SQLite file to read (default: seed/data.db)
    --wipe      Delete existing rows in the cloud tables before inserting.
                Without this flag the script refuses to touch a non-empty database.

No third-party packages required: uses the stdlib sqlite3 module and talks to
Turso over its plain HTTP pipeline API.
"""

import argparse
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

# Must stay identical to SCHEMA_SQL in client/src/lib/db.ts
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        balance REAL NOT NULL DEFAULT 0,
        icon TEXT DEFAULT 'card'
    )""",
    """CREATE TABLE IF NOT EXISTS "transaction" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        date_added TEXT NOT NULL DEFAULT 'not timed'
    )""",
    """CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )""",
]


# ---------------------------------------------------------------------------
# Turso HTTP pipeline client (Hrana over HTTP, JSON encoding)
# ---------------------------------------------------------------------------

def http_url(url: str) -> str:
    url = url.strip().rstrip("/")
    for prefix in ("libsql://", "wss://", "ws://"):
        if url.startswith(prefix):
            return "https://" + url[len(prefix):]
    if not url.startswith("http"):
        return "https://" + url
    return url


def encode_arg(value):
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": str(int(value))}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, bytes):
        import base64
        return {"type": "blob", "base64": base64.b64encode(value).decode()}
    return {"type": "text", "value": str(value)}


class Turso:
    def __init__(self, url: str, token: str):
        self.endpoint = http_url(url) + "/v2/pipeline"
        self.token = token

    def pipeline(self, statements):
        """statements: list of (sql, args) tuples executed sequentially on one connection."""
        requests = [
            {"type": "execute", "stmt": {"sql": sql, "args": [encode_arg(a) for a in (args or [])]}}
            for sql, args in statements
        ]
        requests.append({"type": "close"})
        body = json.dumps({"requests": requests}).encode()
        req = urllib.request.Request(
            self.endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            raise SystemExit(f"HTTP {e.code} from Turso: {detail}") from None

        results = payload.get("results", [])
        for i, r in enumerate(results[:-1]):  # last one is the close
            if r.get("type") == "error":
                sql = statements[i][0] if i < len(statements) else "?"
                raise SystemExit(f"SQL error: {r['error'].get('message')}\n  in: {sql}")
        return [r.get("response", {}).get("result") for r in results[:-1]]

    def execute(self, sql, args=None):
        return self.pipeline([(sql, args)])[0]

    def transaction(self, statements):
        return self.pipeline([("BEGIN", None), *statements, ("COMMIT", None)])


def scalar(result):
    return result["rows"][0][0]["value"]


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=os.environ.get("TURSO_URL"), help="libsql://... database URL")
    ap.add_argument("--token", default=os.environ.get("TURSO_AUTH_TOKEN"), help="database auth token")
    ap.add_argument("--db", default=os.path.join(HERE, "data.db"), help="local SQLite file to read")
    ap.add_argument("--wipe", action="store_true", help="delete existing cloud rows first")
    a = ap.parse_args()

    if not a.url or not a.token:
        ap.error("--url and --token are required (or set TURSO_URL / TURSO_AUTH_TOKEN)")
    if not os.path.exists(a.db):
        ap.error(f"SQLite file not found: {a.db}")

    src = sqlite3.connect(a.db)
    accounts = src.execute("SELECT id, name, balance, icon FROM account ORDER BY id").fetchall()
    txs = src.execute('SELECT id, title, amount, category, date_added FROM "transaction" ORDER BY id').fetchall()
    print(f"Local file: {len(accounts)} accounts, {len(txs)} transactions")

    cloud = Turso(a.url, a.token)
    print("Connecting to", http_url(a.url))
    cloud.pipeline([(s, None) for s in SCHEMA])

    existing_acc = int(scalar(cloud.execute("SELECT COUNT(*) FROM account")))
    existing_tx = int(scalar(cloud.execute('SELECT COUNT(*) FROM "transaction"')))
    if existing_acc or existing_tx:
        if not a.wipe:
            sys.exit(
                f"Cloud database already holds {existing_acc} accounts and {existing_tx} transactions.\n"
                "Re-run with --wipe to replace them."
            )
        print(f"Wiping {existing_acc} accounts and {existing_tx} transactions...")
        cloud.transaction([
            ('DELETE FROM "transaction"', None),
            ("DELETE FROM account", None),
            ("DELETE FROM sqlite_sequence WHERE name IN ('account', 'transaction')", None),
        ])

    # Accounts (ids preserved so any saved tab layout keeps pointing at the right tabs)
    cloud.transaction([
        ("INSERT INTO account (id, name, balance, icon) VALUES (?, ?, ?, ?)",
         [int(i), n, float(b), ic if ic is not None else "card"])
        for i, n, b, ic in accounts
    ])
    print(f"Inserted {len(accounts)} accounts")

    # Transactions in chunks to keep each HTTP request small
    CHUNK = 150
    for start in range(0, len(txs), CHUNK):
        chunk = txs[start:start + CHUNK]
        cloud.transaction([
            ('INSERT INTO "transaction" (id, title, amount, category, date_added) VALUES (?, ?, ?, ?, ?)',
             [int(i), t, float(amt), cat, d if d is not None else "not timed"])
            for i, t, amt, cat, d in chunk
        ])
        print(f"Inserted transactions {start + 1}-{start + len(chunk)}")

    # Verify
    n_acc = int(scalar(cloud.execute("SELECT COUNT(*) FROM account")))
    n_tx = int(scalar(cloud.execute('SELECT COUNT(*) FROM "transaction"')))
    total = float(scalar(cloud.execute("SELECT COALESCE(SUM(balance), 0) FROM account")))
    print(f"\nCloud now holds {n_acc} accounts and {n_tx} transactions; combined balance = {total:,.2f}")
    if n_acc != len(accounts) or n_tx != len(txs):
        sys.exit("Row counts do not match the local file - please inspect.")
    print("Seed complete.")


if __name__ == "__main__":
    main()
