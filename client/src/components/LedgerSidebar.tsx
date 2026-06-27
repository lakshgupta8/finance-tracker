import { useState, useEffect } from 'react';
import { History, X, Activity, ArrowUpRight, ArrowDownRight, Trash2, Search } from 'lucide-react';
import type { Transaction } from '../types';

interface LedgerSidebarProps {
    isLedgerOpen: boolean;
    setIsLedgerOpen: (open: boolean) => void;
    transactions: Transaction[];
    handleDeleteTransaction: (id: number) => void;
}

export function LedgerSidebar({ isLedgerOpen, setIsLedgerOpen, transactions, handleDeleteTransaction }: LedgerSidebarProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [visibleCount, setVisibleCount] = useState(50);

    // Reset visibility limit when search/filter criteria changes
    useEffect(() => {
        setVisibleCount(50);
    }, [searchTerm, selectedCategory]);

    // Extract unique categories (tab names) from transactions to construct dropdown
    const categories = Array.from(new Set(transactions.map(t => t.category || 'General')));

    // Apply filters
    const filteredTransactions = transactions.filter(tx => {
        const titleMatch = tx.title.toLowerCase().includes(searchTerm.toLowerCase());
        const categoryVal = tx.category || 'General';
        const categoryMatch = categoryVal.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSearch = titleMatch || categoryMatch;

        const matchesCategory = selectedCategory === 'ALL' || categoryVal === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    const displayedTransactions = filteredTransactions.slice(0, visibleCount);

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300 ${isLedgerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsLedgerOpen(false)}
            />
            
            {/* Drawer */}
            <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-neutral-950/90 backdrop-blur-xl shadow-2xl border-l border-neutral-800/60 transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${isLedgerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex justify-between items-center p-6 border-neutral-800/50 border-b">
                    <h3 className="flex items-center gap-2 font-bold text-neutral-200 text-lg">
                        <History className="w-5 h-5 text-indigo-400" />
                        Audit History Ledger
                    </h3>
                    <button
                        onClick={() => setIsLedgerOpen(false)}
                        className="hover:bg-neutral-900 p-2 rounded-xl text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Filter and Stats Panel */}
                <div className="bg-neutral-900/20 px-6 py-4 border-neutral-800/30 border-b space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2 bg-neutral-900/80 px-3 py-1.5 border border-neutral-800 text-neutral-400 rounded-lg w-max font-semibold text-xs">
                            <Activity className="w-3.5 h-3.5" />
                            {filteredTransactions.length} of {transactions.length} Records
                        </span>
                        {(searchTerm || selectedCategory !== 'ALL') && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedCategory('ALL');
                                }}
                                className="text-neutral-500 hover:text-indigo-400 font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>

                    <div className="gap-3 grid grid-cols-1 sm:grid-cols-2">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
                            <input
                                type="text"
                                placeholder="Search note..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-neutral-950 pl-8 pr-3 py-2 border border-neutral-800/80 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 rounded-xl focus:outline-none w-full text-neutral-200 text-xs transition-all placeholder-neutral-600"
                            />
                        </div>

                        {/* Category Filter */}
                        <div>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="bg-neutral-950 px-3 py-2 border border-neutral-800/80 focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 rounded-xl focus:outline-none w-full text-neutral-200 text-xs transition-all cursor-pointer"
                            >
                                <option value="ALL">All Places</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {filteredTransactions.length === 0 ? (
                    <div className="flex flex-col flex-1 justify-center items-center p-8 text-neutral-500 text-center">
                        <div className="bg-neutral-900/60 mb-4 p-4 rounded-full">
                            <History className="w-8 h-8 text-neutral-600" />
                        </div>
                        <p className="font-bold text-neutral-400 text-sm">No matches found</p>
                        <p className="mt-2 max-w-[250px] text-neutral-500 text-xs leading-relaxed">
                            Try adjusting your filters or query to find the desired ledger entries.
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 space-y-3 [&::-webkit-scrollbar-thumb]:bg-neutral-800 [&::-webkit-scrollbar-thumb]:hover:bg-neutral-700 [&::-webkit-scrollbar-track]:bg-neutral-950/20 p-6 pr-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar]:w-1.5 overflow-y-auto">
                        {displayedTransactions.map((tx) => {
                            const isGain = tx.amount >= 0;
                            return (
                                <div
                                    key={tx.id}
                                    title={`Added: ${tx.date_added || 'not timed'}`}
                                    className="group flex justify-between items-center bg-neutral-900/20 hover:bg-neutral-900/40 p-4 border border-neutral-900 hover:border-neutral-800 rounded-2xl transition-all cursor-help"
                                >
                                    <div className="flex-1 mr-4 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`p-1 rounded-md ${isGain ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                {isGain ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                            </div>
                                            <span className="font-bold text-neutral-200 text-sm truncate">
                                                {tx.title}
                                            </span>
                                        </div>
                                        <span className="block pl-7 font-medium text-neutral-500 text-xs">
                                            Tab: <strong className="text-neutral-400">{tx.category || 'General'}</strong>
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
                                            className="hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 transition-all cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {filteredTransactions.length > visibleCount && (
                            <div className="pt-2 pb-6 text-center">
                                <button
                                    type="button"
                                    onClick={() => setVisibleCount(prev => prev + 50)}
                                    className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/80 hover:border-neutral-700 text-neutral-300 hover:text-white rounded-xl font-bold text-xs transition-all cursor-pointer"
                                >
                                    Load More Records
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
