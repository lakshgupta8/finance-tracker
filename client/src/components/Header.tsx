import { Activity, History, Database } from 'lucide-react';

interface HeaderProps {
    accountsCount: number;
    onOpenLedger: () => void;
    onOpenSettings: () => void;
}

export function Header({ accountsCount, onOpenLedger, onOpenSettings }: HeaderProps) {
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
                <div className="flex items-center gap-3 bg-neutral-900/40 px-4 py-2 border border-neutral-800/80 backdrop-blur-md rounded-xl shadow-lg shadow-black/30">
                    <div className="bg-emerald-400 rounded-full w-2 h-2 animate-pulse"></div>
                    <span className="font-medium text-neutral-400 text-sm">
                        Active Tabs: <strong className="text-neutral-200">{accountsCount}</strong>
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
                    className="flex items-center gap-2 bg-neutral-900/60 hover:bg-neutral-800/80 px-3 py-2 border border-neutral-800 backdrop-blur-md rounded-xl font-medium text-neutral-400 hover:text-white text-sm shadow-md transition-all cursor-pointer"
                >
                    <Database className="w-4 h-4" />
                </button>
            </div>
        </header>
    );
}
