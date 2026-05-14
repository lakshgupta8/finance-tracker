/* =============================================================================
 * FINANCE TRACKER GUI LAYER
 * Separate Places/Tabs tracking application built with React, TypeScript, & Tailwind.
 * Mirrors physical note-taking tabs to easily add or subtract money per location.
 * ============================================================================= */

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
    Landmark, Wallet, CreditCard, Shield, TrendingUp, Coins, Gem, BadgeDollarSign,
    Plus, Minus, Trash2, GripHorizontal, X, ArrowUpRight, ArrowDownRight, Activity, LayoutDashboard, History
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

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

// Preset icon identifiers mapping to Lucide components
const PRESET_ICONS = ['bank', 'wallet', 'card', 'shield', 'trend', 'coins', 'gem', 'dollar'];

const getIconComponent = (iconStr: string) => {
    switch (iconStr) {
        case '🏦': case 'bank': return Landmark;
        case '💵': case 'wallet': return Wallet;
        case '💳': case 'card': return CreditCard;
        case '🛡️': case 'shield': return Shield;
        case '📈': case 'trend': return TrendingUp;
        case '🪙': case 'coins': return Coins;
        case '💎': case 'gem': return Gem;
        case '💰': case 'dollar': return BadgeDollarSign;
        default: return Wallet;
    }
};

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
    const [newAccIcon, setNewAccIcon] = useState('bank');
    const [isCreatingAcc, setIsCreatingAcc] = useState(false);

    // Isolated inline text inputs tracking the pending add/subtract amount per tab ID
    const [adjustAmounts, setAdjustAmounts] = useState<{ [key: number]: string }>({});
    const [adjustNotes, setAdjustNotes] = useState<{ [key: number]: string }>({});
    const [adjustingId, setAdjustingId] = useState<number | null>(null);

    // Dynamic horizontal page scroll progress tracker percentage
    const [scrollProgress, setScrollProgress] = useState(0);

    // Drag-and-Drop list arrangement state tracking
    const [draggedItem, setDraggedItem] = useState<{ gIdx: number, tIdx: number } | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);
    const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);
    const [layout, setLayout] = useState<number[][]>([]);

    // UI toggles
    const [isLedgerOpen, setIsLedgerOpen] = useState(false);

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
            let parsedLayout: number[][] = [];
            if (savedOrder) {
                try {
                    const orderIds = JSON.parse(savedOrder);
                    if (Array.isArray(orderIds) && orderIds.length > 0) {
                        if (Array.isArray(orderIds[0])) {
                            parsedLayout = orderIds;
                        } else {
                            parsedLayout = orderIds.map((id: number) => [id]);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse saved tab order", e);
                }
            }

            const fetchedIds = new Set(fetchedAccs.map(a => a.id));
            const finalLayout: number[][] = [];
            const idsInLayout = new Set<number>();

            parsedLayout.forEach(group => {
                const validGroup = group.filter(id => fetchedIds.has(id));
                if (validGroup.length > 0) {
                    finalLayout.push(validGroup);
                    validGroup.forEach(id => idsInLayout.add(id));
                }
            });

            fetchedAccs.forEach(a => {
                if (!idsInLayout.has(a.id)) {
                    finalLayout.push([a.id]);
                }
            });

            setAccounts(fetchedAccs);
            setLayout(finalLayout);
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
        } catch (err: any) {
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
        } catch (err: any) {
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

    const handleDragStart = (gIdx: number, tIdx: number) => {
        setDraggedItem({ gIdx, tIdx });
    };

    const handleDragEnter = (gIdx: number, tIdx?: number) => {
        setDragOverGroupIndex(gIdx);
        setDragOverTabIndex(tIdx !== undefined ? tIdx : null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverGroupIndex(null);
        setDragOverTabIndex(null);
    };

    const handleDrop = (targetGroupIndex: number, targetTabIndex?: number) => {
        if (!draggedItem) return;
        const { gIdx, tIdx } = draggedItem;

        let newLayout = layout.map(group => [...group]);
        const accountId = newLayout[gIdx][tIdx];

        // Case 1: Dragging within the SAME group -> rearrange order
        if (gIdx === targetGroupIndex) {
            if (targetTabIndex !== undefined && targetTabIndex !== tIdx) {
                newLayout[gIdx].splice(tIdx, 1);
                newLayout[gIdx].splice(targetTabIndex, 0, accountId);
                setLayout(newLayout);
                localStorage.setItem('finance_tracker_tab_order', JSON.stringify(newLayout));
            }
            handleDragEnd();
            return;
        }

        // Case 2: Dropped onto ANOTHER group div -> Add to that group
        newLayout[gIdx].splice(tIdx, 1);
        if (targetTabIndex !== undefined) {
            newLayout[targetGroupIndex].splice(targetTabIndex, 0, accountId);
        } else {
            newLayout[targetGroupIndex].push(accountId);
        }
        newLayout = newLayout.filter(g => g.length > 0);

        setLayout(newLayout);
        localStorage.setItem('finance_tracker_tab_order', JSON.stringify(newLayout));
        handleDragEnd();
    };

    const handleDropOutside = () => {
        if (!draggedItem) return;
        const { gIdx, tIdx } = draggedItem;

        // Case 3: Hold released OUTSIDE the group div -> drag out to be a separate entity
        let newLayout = layout.map(group => [...group]);
        if (newLayout[gIdx].length > 1) {
            const accountId = newLayout[gIdx][tIdx];
            newLayout[gIdx].splice(tIdx, 1);
            newLayout.push([accountId]);
            setLayout(newLayout);
            localStorage.setItem('finance_tracker_tab_order', JSON.stringify(newLayout));
        }
        handleDragEnd();
    };

    // -------------------------------------------------------------------------
    // RENDER OUTPUT
    // -------------------------------------------------------------------------

    return (
        <div
            className="flex flex-col items-center bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] bg-slate-950 selection:bg-teal-500 from-slate-900 via-slate-950 to-black p-4 md:p-8 min-h-screen font-sans text-slate-100 selection:text-slate-950"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOutside}
        >

            {/* Premium Fixed Horizontal Scroll Progress Bar */}
            <div className="top-0 left-0 z-50 fixed bg-slate-900 w-full h-1">
                <div
                    className="bg-linear-to-r from-indigo-500 to-teal-200 h-full transition-all duration-75 ease-out"
                    style={{ width: `${scrollProgress}%` }}
                ></div>
            </div>

            <div className="space-y-8 mx-auto w-full max-w-5xl">

                {/* Hero Header Section */}
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
                                Active Tabs: <strong className="text-slate-200">{accounts.length}</strong>
                            </span>
                        </div>
                        <button
                            onClick={() => setIsLedgerOpen(true)}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 border border-slate-700/50 rounded-xl font-medium text-slate-200 text-sm transition-colors"
                        >
                            <History className="w-4 h-4" />
                            Ledger
                        </button>
                    </div>
                </header>

                {/* Global Error Notice Indicator */}
                {errorMsg && (
                    <div className="flex items-center gap-2.5 bg-rose-500/10 shadow-lg p-4 border border-rose-500/20 rounded-xl text-rose-400 text-sm animate-fade-in">
                        <X className="w-5 h-5 shrink-0" />
                        <span className="font-medium">{errorMsg}</span>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* TOTAL BALANCE HERO BANNER W/ CHART */}
                {/* ========================================================================= */}
                <div className="group relative bg-[#151b2b] shadow-[-10px_-10px_20px_rgba(255,255,255,0.02),10px_10px_20px_rgba(0,0,0,0.4)] p-6 md:p-8 border border-slate-800/40 rounded-4xl overflow-hidden">
                    <div className="-top-32 -right-32 absolute bg-emerald-500/10 group-hover:bg-emerald-500/15 blur-[100px] rounded-full w-96 h-96 transition-all duration-700 pointer-events-none"></div>
                    <div className="-bottom-32 -left-32 absolute bg-teal-500/10 blur-[100px] rounded-full w-96 h-96 pointer-events-none"></div>

                    <div className="z-10 relative flex md:flex-row flex-col justify-between items-center gap-8">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 font-medium text-slate-400 text-sm uppercase tracking-wide">
                                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                                <span>Overall Combined Total</span>
                            </div>
                            <div className={`text-5xl md:text-6xl font-extrabold tracking-tight transition-all duration-300 ${totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ₹{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="mt-4 max-w-sm text-slate-400 text-sm leading-relaxed">
                                Keep tabs on different physical or digital places where your money lives. Use the modules below to instantly add gains or spendings separately per source.
                            </p>
                        </div>

                        {accounts.length > 0 && (
                            <div className="flex-1 w-full h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={accounts.map(a => ({ name: a.name, value: Math.max(0, a.balance) }))}>
                                        <XAxis dataKey="name" hide />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                                            itemStyle={{ color: '#34d399', fontWeight: 'bold' }}
                                        />
                                        <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                                            {accounts.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#34d399' : '#14b8a6'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
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
                        {layout.length === 0 ? (
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
                            <div className="flex flex-col gap-8 w-full">
                                {layout.map((group, groupIndex) => {
                                    const groupAccounts = group.map(id => accounts.find(a => a.id === id)).filter(Boolean) as Account[];
                                    if (groupAccounts.length === 0) return null;
                                    const groupTotal = groupAccounts.reduce((acc, a) => acc + a.balance, 0);

                                    return (
                                        <div
                                            key={`group-${groupIndex}`}
                                            className={`relative flex flex-col transition-all duration-500 rounded-4xl ${groupAccounts.length > 1 ? 'p-6 md:p-8 bg-[#151b2b] shadow-[-8px_-8px_16px_rgba(255,255,255,0.02),8px_8px_16px_rgba(0,0,0,0.5)] border border-slate-800/40' : ''} ${dragOverGroupIndex === groupIndex && dragOverTabIndex === null ? 'ring-2 ring-teal-500 scale-[1.01] bg-slate-800/20' : ''}`}
                                            onDragEnter={(e) => {
                                                e.stopPropagation();
                                                handleDragEnter(groupIndex);
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onDrop={(e) => {
                                                e.stopPropagation();
                                                handleDrop(groupIndex);
                                            }}
                                        >
                                            {groupAccounts.length > 1 && (
                                                <div className="flex justify-between items-center mb-6 px-2">
                                                    <div className="flex items-center gap-3 font-bold text-slate-400 text-sm uppercase tracking-wider">
                                                        <GripHorizontal className="w-5 h-5 text-slate-500" />
                                                        Merged Group Total
                                                    </div>
                                                    <div className={`text-2xl font-black tracking-tight ${groupTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        ₹{groupTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="gap-6 grid grid-cols-1 md:grid-cols-2 w-full">
                                                {groupAccounts.map((account, tabIndex) => {
                                                    const isAdjusting = adjustingId === account.id;
                                                    const amountVal = adjustAmounts[account.id] || '';
                                                    const noteVal = adjustNotes[account.id] || '';
                                                    const isDragged = draggedItem?.gIdx === groupIndex && draggedItem?.tIdx === tabIndex;

                                                    const IconCmp = getIconComponent(account.icon);
                                                    const isOddAndLast = (groupAccounts.length % 2 !== 0 && tabIndex === groupAccounts.length - 1);

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
                                                                handleDragStart(groupIndex, tabIndex);
                                                            }}
                                                            onDragEnd={handleDragEnd}
                                                            onDragEnter={(e) => {
                                                                e.stopPropagation();
                                                                handleDragEnter(groupIndex, tabIndex);
                                                            }}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                            onDrop={(e) => {
                                                                e.stopPropagation();
                                                                handleDrop(groupIndex, tabIndex);
                                                            }}
                                                            className={`relative flex flex-col justify-between p-6 transition-all duration-300 
                                                                bg-[#1a2035] shadow-[inset_-4px_-4px_8px_rgba(255,255,255,0.01),inset_4px_4px_8px_rgba(0,0,0,0.3)] 
                                                                rounded-3xl border border-slate-800/60
                                                                ${isOddAndLast && groupAccounts.length > 1 ? 'md:col-span-2' : 'col-span-1'}
                                                                ${isDragged ? 'opacity-40 border-dashed border-slate-600 scale-95' : 'hover:shadow-[inset_-2px_-2px_4px_rgba(255,255,255,0.02),inset_2px_2px_4px_rgba(0,0,0,0.5)] hover:-translate-y-1'}
                                                                ${dragOverGroupIndex === groupIndex && dragOverTabIndex === tabIndex ? 'ring-2 ring-teal-500 bg-slate-800/40' : ''}`}
                                                        >
                                                            <div>
                                                                {/* Tab Identity Header */}
                                                                <div className="flex justify-between items-start gap-3 mb-6">
                                                                    <div className="flex items-center gap-4 min-w-0">
                                                                        <div className="mr-1 text-slate-600 hover:text-teal-400 transition-colors cursor-grab">
                                                                            <GripHorizontal className="w-5 h-5" />
                                                                        </div>

                                                                        <div className="flex justify-center items-center bg-slate-900 shadow-[inset_-2px_-2px_4px_rgba(255,255,255,0.02),inset_2px_2px_4px_rgba(0,0,0,0.5)] border border-slate-800/50 rounded-2xl w-12 h-12 text-teal-400 shrink-0">
                                                                            <IconCmp className="w-6 h-6" />
                                                                        </div>
                                                                        <div className="min-w-0 cursor-grab">
                                                                            <h3 className="font-bold text-slate-200 group-hover/card:text-white text-lg truncate transition-colors">
                                                                                {account.name}
                                                                            </h3>
                                                                            <span className="font-semibold text-[10px] text-slate-500 uppercase tracking-widest">
                                                                                Money Tab
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Permanent Remove Button */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteAccount(account.id, account.name)}
                                                                        title="Remove this tab"
                                                                        className="hover:bg-rose-500/10 p-2 rounded-xl text-slate-600 hover:text-rose-400 transition-all duration-200 cursor-pointer"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>

                                                                </div>

                                                                {/* Isolated Live Current Balance Counter */}
                                                                <div className="bg-slate-900/50 mb-6 p-4 border border-slate-800/40 rounded-2xl">
                                                                    <div className="mb-1 font-medium text-slate-500 text-xs uppercase tracking-wide">Current Balance</div>
                                                                    <div className={`text-3xl font-extrabold tracking-tight ${account.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                        ₹{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </div>
                                                                </div>

                                                                {/* Dynamic Form Controls: Add or Subtract immediately */}
                                                                <div className="space-y-3">
                                                                    <div className="flex items-center gap-2 font-bold text-[11px] text-slate-500 uppercase tracking-widest">
                                                                        <span>Quick Action</span>
                                                                    </div>

                                                                    <div className="gap-3 grid grid-cols-2">
                                                                        <div className="relative col-span-2 sm:col-span-1">
                                                                            <span className="top-1/2 left-4 absolute font-bold text-slate-500 text-sm -translate-y-1/2">₹</span>
                                                                            <input
                                                                                type="number"
                                                                                step="any"
                                                                                placeholder="Amount"
                                                                                value={amountVal}
                                                                                onChange={(e) => setAdjustAmounts({ ...adjustAmounts, [account.id]: e.target.value })}
                                                                                className="bg-slate-900/80 py-2.5 pr-3 pl-8 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 w-full font-medium text-slate-200 text-sm transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-slate-600 [appearance:textfield]"
                                                                            />
                                                                        </div>

                                                                        <div className="col-span-2 sm:col-span-1">
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Note (optional)"
                                                                                value={noteVal}
                                                                                onChange={(e) => setAdjustNotes({ ...adjustNotes, [account.id]: e.target.value })}
                                                                                className="bg-slate-900/80 px-3 py-2.5 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 w-full font-medium text-slate-200 text-sm transition-all placeholder-slate-600"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Split Dedicated Inline Trigger Buttons */}
                                                                    <div className="gap-3 grid grid-cols-2 pt-2">
                                                                        <button
                                                                            type="button"
                                                                            disabled={isAdjusting}
                                                                            onClick={() => handleAdjustBalance(account.id, true)}
                                                                            className="flex justify-center items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 px-3 py-2.5 border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl font-bold text-emerald-400 text-sm active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                                                                        >
                                                                            <Plus className="w-4 h-4" />
                                                                            <span>Add</span>
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            disabled={isAdjusting}
                                                                            onClick={() => handleAdjustBalance(account.id, false)}
                                                                            className="flex justify-center items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 px-3 py-2.5 border border-rose-500/20 hover:border-rose-500/40 rounded-xl font-bold text-rose-400 text-sm active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                                                                        >
                                                                            <Minus className="w-4 h-4" />
                                                                            <span>Spend</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Place Module Creator Panel */}
                        <div className="bg-[#151b2b] shadow-[inset_-4px_-4px_8px_rgba(255,255,255,0.01),inset_4px_4px_8px_rgba(0,0,0,0.3)] mx-auto mt-8 p-6 md:p-8 border border-slate-800/60 rounded-4xl w-full max-w-3xl">
                            <h3 className="flex items-center gap-3 mb-6 font-bold text-slate-200 text-lg">
                                <Plus className="w-5 h-5 text-teal-400" />
                                Add New Place Tab
                            </h3>

                            <form onSubmit={handleCreateAccount} className="space-y-5">
                                <div className="gap-5 grid grid-cols-1 md:grid-cols-2">
                                    <div>
                                        <label className="block mb-2 font-medium text-[11px] text-slate-500 uppercase tracking-wider">Place / Account Name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Hidden Wallet, Stock Port"
                                            value={newAccName}
                                            onChange={(e) => setNewAccName(e.target.value)}
                                            className="bg-slate-900 px-4 py-3 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none w-full text-slate-200 text-sm transition-all placeholder-slate-600"
                                        />
                                    </div>

                                    <div>
                                        <label className="block mb-2 font-medium text-[11px] text-slate-500 uppercase tracking-wider">Starting Balance (₹)</label>
                                        <input
                                            type="number"
                                            step="any"
                                            placeholder="0.00"
                                            value={newAccBalance}
                                            onChange={(e) => setNewAccBalance(e.target.value)}
                                            className="bg-slate-900 px-4 py-3 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none w-full text-slate-200 text-sm transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-slate-600 [appearance:textfield]"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block mb-3 font-medium text-[11px] text-slate-500 uppercase tracking-wider">Select Tab Icon</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PRESET_ICONS.map((iconName) => {
                                            const IconComponent = getIconComponent(iconName);
                                            return (
                                                <button
                                                    key={iconName}
                                                    type="button"
                                                    onClick={() => setNewAccIcon(iconName)}
                                                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${newAccIcon === iconName
                                                        ? 'bg-teal-500/20 border-2 border-teal-500 text-teal-400 scale-110 shadow-lg shadow-teal-500/20'
                                                        : 'bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-500 hover:text-slate-300'
                                                        }`}
                                                >
                                                    <IconComponent className="w-5 h-5" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isCreatingAcc}
                                    className="bg-linear-to-r from-emerald-500 hover:from-emerald-400 to-teal-600 hover:to-teal-500 disabled:opacity-50 shadow-lg shadow-teal-500/20 mt-4 px-4 py-3 rounded-xl w-full font-bold text-slate-950 text-sm active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                                >
                                    {isCreatingAcc ? 'Creating Tab...' : 'Create Separate Tab'}
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>

            {/* Sidebar Ledger Overlay */}
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
                        className="hover:bg-slate-800 p-2 rounded-xl text-slate-400 hover:text-white transition-colors"
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

        </div>
    );
}

export default App;