import { useState } from 'react';
import type { FormEvent } from 'react';
import { Database, Link2, KeyRound, X, Unplug } from 'lucide-react';
import type { DbConfig } from '../lib/config';
import { normalizeDbUrl } from '../lib/config';

interface ConnectDatabaseProps {
    /** Existing config when opened from settings; null on first launch. */
    current: DbConfig | null;
    onConnect: (cfg: DbConfig) => Promise<void>;
    onDisconnect?: () => void;
    onClose?: () => void;
}

const inputCls = 'bg-neutral-950/60 px-4 py-3 border border-neutral-800/80 focus:border-emerald-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full text-neutral-200 text-sm transition-all placeholder-neutral-600 font-mono';

export function ConnectDatabase({ current, onConnect, onDisconnect, onClose }: ConnectDatabaseProps) {
    const [url, setUrl] = useState(current?.url ?? '');
    const [token, setToken] = useState(current?.authToken ?? '');
    const [isBusy, setIsBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const cleanUrl = normalizeDbUrl(url);
        const cleanToken = token.trim();
        if (!cleanUrl || !cleanToken) {
            setErrorMsg('Both the database URL and the auth token are required.');
            return;
        }
        try {
            setIsBusy(true);
            setErrorMsg('');
            await onConnect({ url: cleanUrl, authToken: cleanToken });
        } catch (err: any) {
            setErrorMsg(err?.message || 'Could not connect to the database.');
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-center items-center bg-neutral-950/90 backdrop-blur-md p-4 overflow-y-auto">
            <div className="relative bg-neutral-950 shadow-2xl p-6 md:p-8 border border-neutral-800/80 rounded-3xl w-full max-w-lg animate-scale-up">
                {onClose && (
                    <button
                        onClick={onClose}
                        className="top-4 right-4 absolute hover:bg-neutral-900 p-2 rounded-xl text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                <div className="flex items-center gap-4 mb-6">
                    <div className="flex justify-center items-center bg-neutral-900/60 shadow-inner border border-neutral-800/80 rounded-2xl w-14 h-14 shrink-0">
                        <Database className="w-7 h-7 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="font-extrabold text-neutral-100 text-xl tracking-tight">
                            {current ? 'Database Settings' : 'Connect Your Database'}
                        </h2>
                        <p className="mt-1 text-neutral-400 text-sm">
                            Money Tabs syncs every device through one hosted Turso database.
                        </p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-4 bg-rose-500/10 p-3 border border-rose-500/15 rounded-xl text-rose-400 text-xs wrap-break-word">
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="flex items-center gap-2 mb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">
                            <Link2 className="w-3.5 h-3.5" /> Database URL
                        </label>
                        <input
                            type="text"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="libsql://money-tabs-yourname.turso.io"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className={inputCls}
                        />
                    </div>

                    <div>
                        <label className="flex items-center gap-2 mb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">
                            <KeyRound className="w-3.5 h-3.5" /> Auth Token
                        </label>
                        <textarea
                            rows={3}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="eyJhbGciOi..."
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            className={`${inputCls} resize-none break-all`}
                        />
                    </div>

                    <p className="text-neutral-500 text-xs leading-relaxed">
                        Create a free database at <strong className="text-neutral-300">turso.tech</strong>, then copy its URL and
                        generate a token from the dashboard (or run <code className="text-neutral-300">turso db tokens create &lt;name&gt;</code>).
                        The credentials are stored only on this device.
                    </p>

                    <div className="flex gap-3 pt-1">
                        {current && onDisconnect && (
                            <button
                                type="button"
                                onClick={onDisconnect}
                                className="flex justify-center items-center gap-2 bg-neutral-900 hover:bg-rose-500/10 px-4 py-3 border border-neutral-800 hover:border-rose-500/30 rounded-xl font-bold text-neutral-300 hover:text-rose-400 text-sm transition-all cursor-pointer"
                            >
                                <Unplug className="w-4 h-4" />
                                Disconnect
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="flex-1 bg-linear-to-r from-emerald-500 hover:from-emerald-400 to-emerald-600 hover:to-emerald-500 disabled:opacity-50 shadow-emerald-500/25 shadow-lg px-4 py-3 rounded-xl font-bold text-neutral-950 text-sm active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                        >
                            {isBusy ? 'Connecting...' : current ? 'Save & Reconnect' : 'Connect'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
