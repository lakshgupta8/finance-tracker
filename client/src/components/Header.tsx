import { Activity, History, Database, Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import type { SyncStatus } from '../lib/sync';

interface HeaderProps {
    accountsCount: number;
    syncStatus: SyncStatus;
    onSyncNow: () => void;
    onOpenLedger: () => void;
    onOpenSettings: () => void;
}

function timeAgo(ms: number | null): string {
    if (!ms) return 'never';
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
}

function SyncPill({ status, onSyncNow }: { status: SyncStatus; onSyncNow: () => void }) {
    const pending = status.pending > 0 ? ` · ${status.pending} pending` : '';
    const look = {
        idle: status.pending > 0
            ? { Icon: RefreshCw, label: `Uploading${pending}`, cls: 'text-sky-300 border-sky-500/20 bg-sky-500/5' }
            : { Icon: Cloud, label: 'Synced', cls: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5' },
        syncing: { Icon: RefreshCw, label: `Syncing${pending}`, cls: 'text-sky-300 border-sky-500/20 bg-sky-500/5' },
        offline: { Icon: CloudOff, label: `Offline${pending}`, cls: 'text-amber-300 border-amber-500/25 bg-amber-500/5' },
        error: { Icon: AlertTriangle, label: `Sync error${pending}`, cls: 'text-rose-300 border-rose-500/25 bg-rose-500/5' },
    }[status.state];
    const detail = status.state === 'idle' || status.state === 'syncing'
        ? `Last synced ${timeAgo(status.lastSyncedAt)}. Tap to sync now.`
        : `${status.error ?? ''} Changes are saved on this device and will upload automatically. Last synced ${timeAgo(status.lastSyncedAt)}. Tap to retry.`;

    return (
        <button
            type="button"
            onClick={onSyncNow}
            title={detail}
            aria-label={`${look.label}. ${detail}`}
            className={`flex items-center gap-2 px-3 py-2 border backdrop-blur-md rounded-xl font-medium text-sm shadow-md transition-all cursor-pointer active:scale-[0.98] ${look.cls}`}
        >
            <look.Icon className={`w-4 h-4 ${status.state === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{look.label}</span>
        </button>
    );
}

export function Header({ accountsCount, syncStatus, onSyncNow, onOpenLedger, onOpenSettings }: HeaderProps) {
    return (
        <header className="flex md:flex-row flex-col justify-between md:items-center gap-4 pb-6 border-neutral-800/50 border-b">
            <div className="flex items-center gap-4">
                <div className="flex justify-center items-center bg-neutral-900/60 border border-neutral-800/80 rounded-2xl w-14 h-14 font-bold text-2xl shadow-inner">
                    <Activity className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                    <h1 className="bg-clip-text bg-linear-to-r from-white via-neutral-200 to-neutral-400 font-extrabold text-transparent text-2xl md:text-3xl tracking-tight">
                        Money Tabs
                    </h1>
                    <p className="mt-1 font-medium text-neutral-400 text-sm">
                        Track, merge, and organize your wealth.
                    </p>
                </div>
            </div>

            {/* Header Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <SyncPill status={syncStatus} onSyncNow={onSyncNow} />
                <div className="flex items-center gap-3 bg-neutral-900/40 px-4 py-2 border border-neutral-800/80 backdrop-blur-md rounded-xl shadow-lg shadow-black/30">
                    <span className="font-medium text-neutral-400 text-sm">
                        Tabs: <strong className="text-neutral-200">{accountsCount}</strong>
                    </span>
                </div>
                <button
                    onClick={onOpenLedger}
                    className="flex items-center gap-2 bg-neutral-900/60 hover:bg-neutral-800/80 px-4 py-2 border border-neutral-800 backdrop-blur-md rounded-xl font-medium text-neutral-200 hover:text-white text-sm shadow-md transition-all cursor-pointer"
                >
                    <History className="w-4 h-4" />
                    Ledger
                </button>
                <button
                    onClick={onOpenSettings}
                    title="Database settings"
                    aria-label="Database settings"
                    className="flex items-center gap-2 bg-neutral-900/60 hover:bg-neutral-800/80 px-3 py-2 border border-neutral-800 backdrop-blur-md rounded-xl font-medium text-neutral-400 hover:text-white text-sm shadow-md transition-all cursor-pointer"
                >
                    <Database className="w-4 h-4" />
                </button>
            </div>
        </header>
    );
}
