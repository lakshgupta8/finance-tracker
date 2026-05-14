/* =============================================================================
 * FINANCE TRACKER GUI LAYER
 * Separate Places/Tabs tracking application built with React, TypeScript, & Tailwind.
 * Mirrors physical note-taking tabs to easily add or subtract money per location.
 * ============================================================================= */

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

// -----------------------------------------------------------------------------
// CORE DATA INTERFACES
// -----------------------------------------------------------------------------

/**
 * Account mapping entity corresponding to a discrete place/source of money.
 */
type Account = {
    id: number;
    name: string;
    balance: number;
    icon: string;
};

/**
 * Historical record log generated upon balance adjustments to track activity.
 */
type Transaction = {
    id: number;
    title: string;
    amount: number;
    category: string;
};

// Preset emoji icons offered during creation of new tracking tabs
const PRESET_ICONS = ['🏦', '💵', '💳', '🛡️', '📈', '🪙', '💎', '💰'];

function App() {
    // -------------------------------------------------------------------------
    // COMPONENT STATE LOGIC
    // -------------------------------------------------------------------------

    // Persistent storage records retrieved from backend API
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    // Creation modal/form inputs for spinning up a separate new place tab
    const [newAccName, setNewAccName] = useState('');
    const [newAccBalance, setNewAccBalance] = useState('');
    const [newAccIcon, setNewAccIcon] = useState('🏦');
    const [isCreatingAcc, setIsCreatingAcc] = useState(false);

    // Isolated inline text inputs tracking the pending add/subtract amount per tab ID
    const [adjustAmounts, setAdjustAmounts] = useState<{ [key: number]: string }>({});
    const [adjustNotes, setAdjustNotes] = useState<{ [key: number]: string }>({});
    const [adjustingId, setAdjustingId] = useState<number | null>(null);

    // Dynamic horizontal page scroll progress tracker percentage
    const [scrollProgress, setScrollProgress] = useState(0);

    // Drag-and-Drop list arrangement state tracking
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // -------------------------------------------------------------------------
    // DATA FETCHING & SYNCHRONIZATION
    // -------------------------------------------------------------------------

    /**
     * Executes concurrent network calls to pull updated balances and trace history.
     */
    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [accRes, txRes] = await axios.all([
                axios.get('/api/accounts'),
                axios.get('/api/transactions')
            ]);

            const fetchedAccs: Account[] = accRes.data;
            const savedOrder = localStorage.getItem('finance_tracker_tab_order');
            if (savedOrder) {
                try {
                    const orderIds: number[] = JSON.parse(savedOrder);
                    fetchedAccs.sort((a, b) => {
                        const idxA = orderIds.indexOf(a.id);
                        const idxB = orderIds.indexOf(b.id);
                        if (idxA === -1 && idxB === -1) return 0;
                        if (idxA === -1) return 1;
                        if (idxB === -1) return -1;
                        return idxA - idxB;
                    });
                } catch (e) {
                    console.error("Failed to parse saved tab order", e);
                }
            }

            setAccounts(fetchedAccs);
            setTransactions(txRes.data);
            setErrorMsg('');
        } catch (err) {
            console.error(err);
            setErrorMsg('Failed to synchronize data. Please ensure the backend dev server is online.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            if (totalHeight <= 0) {
                setScrollProgress(0);
            } else {
                const progress = (window.scrollY / totalHeight) * 100;
                setScrollProgress(Math.min(100, Math.max(0, progress)));
            }
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // High-fidelity edge auto-scrolling loop while dragging close to viewport boundaries
    const scrollSpeedRef = useRef<number>(0);
    const scrollFrameRef = useRef<number | null>(null);

    useEffect(() => {
        const performSmoothScroll = () => {
            if (scrollSpeedRef.current !== 0) {
                window.scrollBy({ top: scrollSpeedRef.current, left: 0, behavior: 'auto' });
            }
            scrollFrameRef.current = requestAnimationFrame(performSmoothScroll);
        };

        scrollFrameRef.current = requestAnimationFrame(performSmoothScroll);

        const handleGlobalDragOver = (e: DragEvent) => {
            const buffer = 140; // Proximity detection boundary in pixels
            const maxSpeed = 18; // Silky peak scroll intensity per frame

            if (e.clientY < buffer) {
                const intensity = (buffer - e.clientY) / buffer;
                scrollSpeedRef.current = -(intensity * maxSpeed);
            } else if (e.clientY > window.innerHeight - buffer) {
                const intensity = (e.clientY - (window.innerHeight - buffer)) / buffer;
                scrollSpeedRef.current = intensity * maxSpeed;
            } else {
                scrollSpeedRef.current = 0;
            }
        };

        const handleGlobalDragEnd = () => {
            scrollSpeedRef.current = 0;
        };

        window.addEventListener('dragover', handleGlobalDragOver);
        window.addEventListener('dragend', handleGlobalDragEnd);
        window.addEventListener('drop', handleGlobalDragEnd);

        return () => {
            if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
            window.removeEventListener('dragover', handleGlobalDragOver);
            window.removeEventListener('dragend', handleGlobalDragEnd);
            window.removeEventListener('drop', handleGlobalDragEnd);
        };
    }, []);

    // =========================================================================
    // THE "TOTAL" CALCULATION
    // =========================================================================
    // Use a simple JavaScript reduce function to compute Total Balance across all separate tabs/places
    // Total = sum of all account balances
    const totalBalance = accounts.reduce((acc, account) => acc + account.balance, 0);

    // -------------------------------------------------------------------------
    // ACTION HANDLERS
    // -------------------------------------------------------------------------

    /**
     * Dispatches a new tracking tab creation payload to the remote backend.
     */
    const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newAccName.trim()) {
            setErrorMsg('Please specify a valid name for the new place of money.');
            return;
        }

        try {
            setIsCreatingAcc(true);
            setErrorMsg('');
            await axios.post('/api/accounts', {
                name: newAccName.trim(),
                balance: parseFloat(newAccBalance) || 0,
                icon: newAccIcon
            });
            setNewAccName('');
            setNewAccBalance('');
            await fetchData();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.error || 'Failed to setup new tab.');
        } finally {
            setIsCreatingAcc(false);
        }
    };

    /**
     * Dispatches positive or negative incremental adjustments to an existing place balance.
     */
    const handleAdjustBalance = async (accountId: number, isAddition: boolean) => {
        const amountStr = adjustAmounts[accountId] || '';
        const parsed = parseFloat(amountStr);
        if (!amountStr.trim() || isNaN(parsed) || parsed <= 0) {
            setErrorMsg('Please enter a valid positive numeric amount to add or subtract.');
            return;
        }

        const finalAmount = isAddition ? parsed : -parsed;
        const note = adjustNotes[accountId]?.trim() || (isAddition ? 'Added funds' : 'Spent funds');

        try {
            setAdjustingId(accountId);
            setErrorMsg('');
            await axios.post(`/api/accounts/${accountId}/adjust`, {
                amount: finalAmount,
                note: note
            });

            // Flush temporary input buffers for the adjusted tab
            setAdjustAmounts(prev => ({ ...prev, [accountId]: '' }));
            setAdjustNotes(prev => ({ ...prev, [accountId]: '' }));
            await fetchData();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.error || 'Failed to update balance.');
        } finally {
            setAdjustingId(null);
        }
    };

    /**
     * Deletes a place tab permanently upon confirmation.
     */
    const handleDeleteAccount = async (accountId: number, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the "${name}" tab?`)) return;
        try {
            await axios.delete(`/api/accounts/${accountId}`);
            await fetchData();
        } catch (err) {
            console.error(err);
            setErrorMsg('Failed to delete place tab.');
        }
    };

    /**
     * Reverts a ledger trace log item.
     */
    const handleDeleteTransaction = async (txId: number) => {
        try {
            await axios.delete(`/api/transactions/${txId}`);
            await fetchData();
        } catch (err) {
            console.error(err);
            setErrorMsg('Failed to remove trace record.');
        }
    };

    // -------------------------------------------------------------------------
    // DRAG AND DROP HANDLERS
    // -------------------------------------------------------------------------

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragEnter = (index: number) => {
        setDragOverIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleDrop = (targetIndex: number) => {
        if (draggedIndex === null || draggedIndex === targetIndex) {
            handleDragEnd();
            return;
        }

        const updatedAccounts = [...accounts];
        const [movedItem] = updatedAccounts.splice(draggedIndex, 1);
        updatedAccounts.splice(targetIndex, 0, movedItem);

        setAccounts(updatedAccounts);
        localStorage.setItem('finance_tracker_tab_order', JSON.stringify(updatedAccounts.map(a => a.id)));
        handleDragEnd();
    };

    // -------------------------------------------------------------------------
    // RENDER OUTPUT
    // -------------------------------------------------------------------------

    return (
        <div className="flex flex-col items-center bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] bg-slate-950 selection:bg-teal-500 from-slate-900 via-slate-950 to-black p-4 md:p-8 min-h-screen font-sans text-slate-100 selection:text-slate-950">

            {/* Premium Fixed Horizontal Scroll Progress Bar */}
            <div className="top-0 left-0 z-50 fixed bg-slate-900 w-full h-1">
                <div
                    className="bg-linear-to-r from-indigo-500 to-teal-200 h-full transition-all duration-75 ease-out"
                    style={{ width: `${scrollProgress}%` }}
                ></div>
            </div>

            <div className="space-y-8 mx-auto w-full max-w-5xl">

                {/* Hero Header Section */}
                <header className="flex md:flex-row flex-col justify-between md:items-center gap-4 pb-4 border-slate-800/80 border-b">
                    <div className="flex items-center gap-3.5">
                        <div className="flex justify-center items-center bg-linear-to-tr from-emerald-500 to-teal-400 shadow-emerald-500/20 shadow-lg rounded-xl w-11 h-11 font-bold text-slate-950 text-xl">
                            💼
                        </div>
                        <div>
                            <h1 className="bg-clip-text bg-linear-to-r from-white via-slate-200 to-slate-400 font-bold text-transparent text-xl md:text-2xl tracking-tight">
                                Money Tabs GUI
                            </h1>
                            <p className="mt-0.5 font-medium text-slate-400 text-xs">
                                Separate places tracking GUI &bull; Add or subtract money as you go
                            </p>
                        </div>
                    </div>

                    {/* Fast live summary statistics */}
                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 border border-slate-800 rounded-xl">
                        <div className="bg-emerald-400 rounded-full w-2 h-2 animate-pulse"></div>
                        <span className="font-medium text-slate-400 text-xs">
                            Active Tabs: <strong className="text-slate-200">{accounts.length}</strong>
                        </span>
                    </div>
                </header>

                {/* Global Error Notice Indicator */}
                {errorMsg && (
                    <div className="flex items-center gap-2.5 bg-rose-500/10 shadow-lg p-4 border border-rose-500/20 rounded-xl text-rose-400 text-xs animate-fade-in">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        <span className="font-medium">{errorMsg}</span>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* TOTAL BALANCE HERO BANNER */}
                {/* ========================================================================= */}
                <div className="group relative bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-black/60 p-6 md:p-8 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="-top-20 -right-20 absolute bg-emerald-500/10 group-hover:bg-emerald-500/15 blur-3xl rounded-full w-60 h-60 transition-all duration-500 pointer-events-none"></div>
                    <div className="-bottom-20 -left-20 absolute bg-teal-500/5 blur-3xl rounded-full w-60 h-60 pointer-events-none"></div>

                    <div className="z-10 relative flex md:flex-row flex-col justify-between md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1 font-medium text-slate-400 text-sm">
                                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Overall Combined Total</span>
                            </div>
                            <div className={`text-4xl md:text-5xl font-extrabold tracking-tight transition-all duration-300 ${totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ₹{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div className="bg-slate-950/60 p-4 border border-slate-800/80 rounded-xl max-w-xs text-slate-400 text-xs leading-relaxed">
                            💡 <strong>Workflow Notes:</strong> Keep tabs on different physical or digital places where your money lives. Use the modules below to instantly add gains or spendings separately per source.
                        </div>
                    </div>
                </div>

                {/* State Loading Layout Overlay */}
                {isLoading && accounts.length === 0 ? (
                    <div className="flex flex-col justify-center items-center space-y-3 py-16 text-slate-500">
                        <svg className="w-8 h-8 text-teal-500 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="font-medium text-xs">Loading tracking layout...</p>
                    </div>
                ) : (
                    <>
                        {/* ========================================================================= */}
                        {/* THE SEPARATE PLACES/TABS GRID */}
                        {/* ========================================================================= */}
                        {accounts.length === 0 ? (
                            <div className="flex flex-col justify-center items-center bg-slate-900/40 shadow-inner backdrop-blur-md my-4 p-10 border border-slate-800 border-dashed rounded-2xl text-center">
                                <div className="flex justify-center items-center bg-slate-950/80 mb-3 border border-slate-800 rounded-full w-14 h-14 text-2xl">
                                    📭
                                </div>
                                <h3 className="font-bold text-slate-300 text-base">No Separate Money Tabs Found</h3>
                                <p className="mt-1 max-w-md text-slate-500 text-xs leading-relaxed">
                                    Your multi-tabbed layout is currently empty. Use the <strong>"Add New Place Tab"</strong> module below to create discrete places/sources of money (e.g., Main Bank, Wallet Cash) and track them independently.
                                </p>
                            </div>
                        ) : (
                            <div className="gap-6 grid grid-cols-1 md:grid-cols-2">
                                {accounts.map((account, index) => {
                                    const isAdjusting = adjustingId === account.id;
                                    const amountVal = adjustAmounts[account.id] || '';
                                    const noteVal = adjustNotes[account.id] || '';

                                    return (
                                        <div
                                            key={account.id}
                                            draggable
                                            onDragStart={(e) => {
                                                const target = e.target as HTMLElement;
                                                if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                handleDragStart(index);
                                            }}
                                            onDragEnter={() => handleDragEnter(index)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={() => handleDrop(index)}
                                            className={`group/card relative flex flex-col justify-between bg-slate-900/60 shadow-xl backdrop-blur-xl p-5 border rounded-2xl transition-all duration-300 ${dragOverIndex === index ? 'border-teal-500 scale-[1.02] bg-slate-800/80 z-20' : 'border-slate-800 hover:border-slate-700/60'
                                                } ${draggedIndex === index ? 'opacity-40 border-dashed border-slate-700' : ''}`}
                                        >
                                            <div>
                                                {/* Tab Identity Header */}
                                                <div className="flex justify-between items-start gap-3 mb-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="flex justify-center items-center bg-slate-950 shadow-inner border border-slate-800 rounded-xl w-10 h-10 text-lg shrink-0">
                                                            {account.icon || '💳'}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-slate-200 group-hover/card:text-white text-base truncate transition-colors">
                                                                {account.name}
                                                            </h3>
                                                            <span className="font-semibold text-[10px] text-slate-500 uppercase tracking-wider">
                                                                Separate Money Tab
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Permanent Remove Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteAccount(account.id, account.name)}
                                                        title="Remove this tab"
                                                        className="hover:bg-rose-500/10 p-1.5 rounded-lg text-slate-600 hover:text-rose-400 transition-all duration-200 cursor-pointer"
                                                    >
                                                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
                                                            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
                                                        </svg>
                                                    </button>

                                                </div>

                                                {/* Isolated Live Current Balance Counter */}
                                                <div className="bg-slate-950/60 mb-4.5 p-3.5 border border-slate-800/60 rounded-xl">
                                                    <div className="mb-0.5 font-medium text-slate-500 text-xs">Current Balance</div>
                                                    <div className={`text-2xl font-extrabold tracking-tight ${account.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        ₹{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>

                                                {/* Dynamic Form Controls: Add or Subtract immediately */}
                                                <div className="space-y-2.5">
                                                    <div className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-400">
                                                        <span>⚡ Quick Add / Subtract</span>
                                                    </div>

                                                    <div className="gap-2 grid grid-cols-2">
                                                        <div className="relative col-span-2 sm:col-span-1">
                                                            <span className="top-1/2 left-3 absolute font-bold text-slate-600 text-xs -translate-y-1/2">₹</span>
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                placeholder="Amount"
                                                                value={amountVal}
                                                                onChange={(e) => setAdjustAmounts({ ...adjustAmounts, [account.id]: e.target.value })}
                                                                className="bg-slate-950 py-1.5 pr-2.5 pl-7 border border-slate-800 focus:border-teal-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 w-full text-slate-200 text-xs transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-slate-600 [appearance:textfield]"
                                                            />
                                                        </div>

                                                        <div className="col-span-2 sm:col-span-1">
                                                            <input
                                                                type="text"
                                                                placeholder="Note (optional)"
                                                                value={noteVal}
                                                                onChange={(e) => setAdjustNotes({ ...adjustNotes, [account.id]: e.target.value })}
                                                                className="bg-slate-950 px-2.5 py-1.5 border border-slate-800 focus:border-teal-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 w-full text-slate-200 text-xs transition-all placeholder-slate-600"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Split Dedicated Inline Trigger Buttons */}
                                                    <div className="gap-2 grid grid-cols-2 pt-1">
                                                        <button
                                                            type="button"
                                                            disabled={isAdjusting}
                                                            onClick={() => handleAdjustBalance(account.id, true)}
                                                            className="flex justify-center items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 px-2 py-1.5 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg font-semibold text-emerald-400 text-xs active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                                                        >
                                                            <span className="text-base leading-none">+</span>
                                                            <span>Add</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={isAdjusting}
                                                            onClick={() => handleAdjustBalance(account.id, false)}
                                                            className="flex justify-center items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 px-2 py-1.5 border border-rose-500/20 hover:border-rose-500/40 rounded-lg font-semibold text-rose-400 text-xs active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                                                        >
                                                            <span className="text-base leading-none">&minus;</span>
                                                            <span>Spend</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Secondary Panel Modules: Tab Instantiation and Historic Activity Ledger */}
                        <div className="items-start gap-6 grid grid-cols-1 lg:grid-cols-12 pt-2">

                            {/* Place Module Creator Panel */}
                            <div className="lg:col-span-5 bg-slate-900/60 shadow-xl backdrop-blur-xl p-5 border border-slate-800/80 rounded-2xl">
                                <h3 className="flex items-center gap-2 mb-3 font-bold text-slate-200 text-sm">
                                    <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Add New Place Tab
                                </h3>

                                <form onSubmit={handleCreateAccount} className="space-y-3">
                                    <div>
                                        <label className="block mb-1 font-medium text-[11px] text-slate-400">Place / Account Name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Hidden Wallet, Stock Port"
                                            value={newAccName}
                                            onChange={(e) => setNewAccName(e.target.value)}
                                            className="bg-slate-950 px-3 py-2 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none w-full text-slate-200 text-xs transition-all placeholder-slate-600"
                                        />
                                    </div>

                                    <div>
                                        <label className="block mb-1 font-medium text-[11px] text-slate-400">Starting Balance (₹)</label>
                                        <input
                                            type="number"
                                            step="any"
                                            placeholder="0.00"
                                            value={newAccBalance}
                                            onChange={(e) => setNewAccBalance(e.target.value)}
                                            className="bg-slate-950 px-3 py-2 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none w-full text-slate-200 text-xs transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-slate-600 [appearance:textfield]"
                                        />
                                    </div>

                                    <div>
                                        <label className="block mb-1.5 font-medium text-[11px] text-slate-400">Select Tab Icon</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PRESET_ICONS.map((icon) => (
                                                <button
                                                    key={icon}
                                                    type="button"
                                                    onClick={() => setNewAccIcon(icon)}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all cursor-pointer ${newAccIcon === icon
                                                        ? 'bg-teal-500/20 border-teal-500 text-white scale-110'
                                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
                                                        }`}
                                                >
                                                    {icon}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isCreatingAcc}
                                        className="bg-linear-to-r from-emerald-500 hover:from-emerald-400 to-teal-600 hover:to-teal-500 disabled:opacity-50 shadow-md mt-2 px-3 py-2 rounded-xl w-full font-bold text-slate-950 text-xs active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                                    >
                                        {isCreatingAcc ? 'Creating Tab...' : 'Create Separate Tab'}
                                    </button>
                                </form>
                            </div>

                            {/* Consolidated Trace Ledger List */}
                            <div className="flex flex-col lg:col-span-7 bg-slate-900/60 shadow-xl backdrop-blur-xl p-5 border border-slate-800/80 rounded-2xl min-h-[260px]">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="flex items-center gap-2 font-bold text-slate-200 text-sm">
                                        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                        </svg>
                                        Audit History Ledger
                                    </h3>
                                    <span className="bg-slate-800 px-2 py-0.5 border border-slate-700/60 rounded-full font-semibold text-[10px] text-slate-400">
                                        {transactions.length} recorded
                                    </span>
                                </div>

                                {transactions.length === 0 ? (
                                    <div className="flex flex-col flex-1 justify-center items-center py-8 text-slate-500 text-center">
                                        <p className="font-medium text-xs">No actions tracked yet</p>
                                        <p className="mt-1 max-w-xs text-[10px] text-slate-600">
                                            Use the Quick Add/Spend controls on any place card above to leave audit trace records.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex-1 space-y-2 [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:hover:bg-slate-700 [&::-webkit-scrollbar-track]:bg-slate-950/40 pr-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar]:w-1.5 max-h-[220px] overflow-y-auto">
                                        {transactions.map((tx) => {
                                            const isGain = tx.amount >= 0;
                                            return (
                                                <div
                                                    key={tx.id}
                                                    className="group flex justify-between items-center bg-slate-950/40 hover:bg-slate-800/40 p-2.5 border border-slate-800/40 hover:border-slate-700/50 rounded-xl text-xs transition-all"
                                                >
                                                    <div className="flex-1 mr-2 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-slate-200 truncate">
                                                                {tx.title}
                                                            </span>
                                                        </div>
                                                        <span className="block mt-0.5 font-medium text-[10px] text-slate-500">
                                                            Tab: <strong className="text-slate-400">{tx.category || 'General'}</strong>
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`font-bold tracking-tight ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {isGain ? '+' : ''}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteTransaction(tx.id)}
                                                            title="Revert adjustment trace"
                                                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-600 hover:text-rose-400 transition-all cursor-pointer"
                                                        >
                                                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                                                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
                                                                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}

export default App;