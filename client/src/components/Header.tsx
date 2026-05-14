import { Activity, History } from 'lucide-react';

interface HeaderProps {
    accountsCount: number;
    onOpenLedger: () => void;
}

export function Header({ accountsCount, onOpenLedger }: HeaderProps) {
    return (
        <header className="flex md:flex-row flex-col justify-between md:items-center gap-4 pb-6 border-slate-800/50 border-b">
            <div className="flex items-center gap-4">
                <div className="flex justify-center items-center bg-slate-900 shadow-[inset_-2px_-2px_6px_rgba(255,255,255,0.02),inset_2px_2px_6px_rgba(0,0,0,0.5)] border border-slate-800/50 rounded-2xl w-14 h-14 font-bold text-slate-950 text-2xl">
                    <Activity className="w-7 h-7 text-teal-400" />
                </div>
                <div>
                    <h1 className="bg-clip-text bg-linear-to-r from-white via-slate-200 to-slate-400 font-extrabold text-transparent text-2xl md:text-3xl tracking-tight">
                        Money Tabs
                    </h1>
                    <p className="mt-1 font-medium text-slate-400 text-sm">
                        Track, merge, and organize your wealth.
                    </p>
                </div>
            </div>

            {/* Header Controls */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 bg-slate-900/80 shadow-sm px-4 py-2 border border-slate-800/60 rounded-xl">
                    <div className="bg-emerald-400 rounded-full w-2 h-2 animate-pulse"></div>
                    <span className="font-medium text-slate-400 text-sm">
                        Active Tabs: <strong className="text-slate-200">{accountsCount}</strong>
                    </span>
                </div>
                <button
                    onClick={onOpenLedger}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700/50 rounded-xl font-medium text-slate-200 text-sm transition-colors cursor-pointer"
                >
                    <History className="w-4 h-4" />
                    Ledger
                </button>
            </div>
        </header>
    );
}
