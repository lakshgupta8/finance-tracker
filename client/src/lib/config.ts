/* =============================================================================
 * DATABASE CONNECTION CONFIG
 * The apps talk directly to a hosted Turso (libSQL) database. The connection
 * details are either baked in at build time via VITE_TURSO_URL /
 * VITE_TURSO_AUTH_TOKEN, or entered once inside the app and kept in localStorage.
 * ============================================================================= */

export type DbConfig = {
    url: string;
    authToken: string;
};

const STORAGE_KEY = 'money_tabs_db_config';

function envDefaults(): DbConfig | null {
    const url = (import.meta.env.VITE_TURSO_URL as string | undefined)?.trim();
    const authToken = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
    if (url && authToken) return { url, authToken };
    return null;
}

export function loadDbConfig(): DbConfig | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.url === 'string' && typeof parsed.authToken === 'string') {
                return parsed as DbConfig;
            }
        }
    } catch (e) {
        console.error('Failed to read stored database config', e);
    }
    return envDefaults();
}

export function saveDbConfig(cfg: DbConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearDbConfig() {
    localStorage.removeItem(STORAGE_KEY);
}

/** Accepts libsql://, https:// or a bare host and returns a clean URL. */
export function normalizeDbUrl(input: string): string {
    let url = input.trim();
    if (!url) return url;
    if (!/^[a-z]+:\/\//i.test(url)) url = `libsql://${url}`;
    return url.replace(/\/+$/, '');
}
