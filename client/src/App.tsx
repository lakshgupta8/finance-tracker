/* =============================================================================
 * FINANCE TRACKER GUI LAYER
 * Separate Places/Tabs tracking application built with React, TypeScript, & Tailwind.
 * Mirrors physical note-taking tabs to easily add or subtract money per location.
 * ============================================================================= */

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { CreateAccountForm } from './components/CreateAccountForm';
import { LedgerSidebar } from './components/LedgerSidebar';
import { AccountCard } from './components/AccountCard';
import type { Account, Transaction } from './types';
// -----------------------------------------------------------------------------
// CORE DATA INTERFACES
// -----------------------------------------------------------------------------


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
                <Header accountsCount={accounts.length} onOpenLedger={() => setIsLedgerOpen(true)} />

                {errorMsg && (
                    <div className="flex items-center gap-2.5 bg-rose-500/10 shadow-lg p-4 border border-rose-500/20 rounded-xl text-rose-400 text-sm animate-fade-in">
                        <span className="font-medium">{errorMsg}</span>
                    </div>
                )}

                <HeroBanner accounts={accounts} totalBalance={totalBalance} />

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
                                                        Merged Group Total
                                                    </div>
                                                    <div className={`text-2xl font-black tracking-tight ${groupTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        ₹{groupTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="gap-6 grid grid-cols-1 md:grid-cols-2 w-full">
                                                {groupAccounts.map((account, tabIndex) => {
                                                    const isOddAndLast = (groupAccounts.length % 2 !== 0 && tabIndex === groupAccounts.length - 1);
                                                    return (
                                                        <AccountCard
                                                            key={account.id}
                                                            account={account}
                                                            groupIndex={groupIndex}
                                                            tabIndex={tabIndex}
                                                            isOddAndLast={isOddAndLast}
                                                            isGrouped={groupAccounts.length > 1}
                                                            isAdjusting={adjustingId === account.id}
                                                            amountVal={adjustAmounts[account.id] || ''}
                                                            noteVal={adjustNotes[account.id] || ''}
                                                            isDragged={draggedItem?.gIdx === groupIndex && draggedItem?.tIdx === tabIndex}
                                                            isDragOver={dragOverGroupIndex === groupIndex && dragOverTabIndex === tabIndex}
                                                            setAdjustAmounts={(val) => setAdjustAmounts({ ...adjustAmounts, [account.id]: val })}
                                                            setAdjustNotes={(val) => setAdjustNotes({ ...adjustNotes, [account.id]: val })}
                                                            handleAdjustBalance={handleAdjustBalance}
                                                            handleDeleteAccount={handleDeleteAccount}
                                                            handleDragStart={handleDragStart}
                                                            handleDragEnd={handleDragEnd}
                                                            handleDragEnter={handleDragEnter}
                                                            handleDrop={handleDrop}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <CreateAccountForm
                            newAccName={newAccName} setNewAccName={setNewAccName}
                            newAccBalance={newAccBalance} setNewAccBalance={setNewAccBalance}
                            newAccIcon={newAccIcon} setNewAccIcon={setNewAccIcon}
                            isCreatingAcc={isCreatingAcc} handleCreateAccount={handleCreateAccount}
                        />
                    </>
                )}
            </div>

            <LedgerSidebar
                isLedgerOpen={isLedgerOpen}
                setIsLedgerOpen={setIsLedgerOpen}
                transactions={transactions}
                handleDeleteTransaction={handleDeleteTransaction}
            />
        </div>
    );
}

export default App;