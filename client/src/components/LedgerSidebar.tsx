import { History, X, Activity, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import type { Transaction } from '../types';

interface LedgerSidebarProps {
    isLedgerOpen: boolean;
    setIsLedgerOpen: (open: boolean) => void;
    transactions: Transaction[];
    handleDeleteTransaction: (id: number) => void;
}

export function LedgerSidebar({ isLedgerOpen, setIsLedgerOpen, transactions, handleDeleteTransaction }: LedgerSidebarProps) {
    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isLedgerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsLedgerOpen(false)}
            />
            
            {/* Drawer */}
            <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-slate-900/95 backdrop-blur-3xl shadow-2xl border-l border-slate-800/80 transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${isLedgerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex justify-between items-center p-6 border-slate-800/50 border-b">
                    <h3 className="flex items-center gap-2 font-bold text-slate-200 text-lg">
                        <History className="w-5 h-5 text-indigo-400" />
                        Audit History Ledger
                    </h3>
                    <button
                        onClick={() => setIsLedgerOpen(false)}
                        className="hover:bg-slate-800 p-2 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-slate-900/50 px-6 py-4 border-slate-800/30 border-b">
                    <span className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 border border-slate-700/60 rounded-lg w-max font-semibold text-slate-400 text-xs">
                        <Activity className="w-3.5 h-3.5" />
                        {transactions.length} Activity Records
                    </span>
                </div>

                {transactions.length === 0 ? (
                    <div className="flex flex-col flex-1 justify-center items-center p-8 text-slate-500 text-center">
                        <div className="bg-slate-800/50 mb-4 p-4 rounded-full">
                            <History className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="font-bold text-slate-400 text-sm">No actions tracked yet</p>
                        <p className="mt-2 max-w-[250px] text-slate-500 text-xs leading-relaxed">
                            Use the Quick Add/Spend controls on any place card to leave audit trace records.
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 space-y-3 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:hover:bg-slate-700 [&::-webkit-scrollbar-track]:bg-slate-950/40 p-6 pr-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar]:w-1.5 overflow-y-auto">
                        {transactions.map((tx) => {
                            const isGain = tx.amount >= 0;
                            return (
                                <div
                                    key={tx.id}
                                    className="group flex justify-between items-center bg-slate-800/30 hover:bg-slate-800/60 p-4 border border-slate-800/50 hover:border-slate-700/80 rounded-2xl transition-all"
                                >
                                    <div className="flex-1 mr-4 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`p-1 rounded-md ${isGain ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                {isGain ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                            </div>
                                            <span className="font-bold text-slate-200 text-sm truncate">
                                                {tx.title}
                                            </span>
                                        </div>
                                        <span className="block pl-7 font-medium text-slate-500 text-xs">
                                            Tab: <strong className="text-slate-400">{tx.category || 'General'}</strong>
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={`font-black tracking-tight text-sm ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {isGain ? '+' : ''}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTransaction(tx.id)}
                                            title="Revert adjustment trace"
                                            className="hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
