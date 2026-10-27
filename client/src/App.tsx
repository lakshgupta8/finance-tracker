/* =============================================================================
 * FINANCE TRACKER GUI LAYER
 * Separate Places/Tabs tracking application built with React, TypeScript, & Tailwind.
 * Mirrors physical note-taking tabs to easily add or subtract money per location.
 * Runs identically inside the Windows (Electron) and Android (Capacitor) shells.
 * All reads and writes go to an offline copy on the device (lib/sync.ts), which
 * syncs with the shared hosted database in the background.
 * ============================================================================= */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createClient } from '@libsql/client/web';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { CreateAccountForm } from './components/CreateAccountForm';
import { LedgerSidebar } from './components/LedgerSidebar';
import { AccountCard } from './components/AccountCard';
import { EditAccountModal } from './components/EditAccountModal';
import { ConnectDatabase } from './components/ConnectDatabase';
import type { Account } from './types';
import { SyncedRepo, ensureRemoteSchema, friendlyError, type RepoView, type SyncStatus } from './lib/sync';
import { IndexedDbStore, localStoreNameFor } from './lib/localStore';
import { loadDbConfig, saveDbConfig, clearDbConfig, type DbConfig } from './lib/config';

const EMPTY_VIEW: RepoView = { accounts: [], transactions: [], layout: null, neverSynced: true };
const IDLE_STATUS: SyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };

/** Applies the saved grouping to the live tabs: drops deleted ids, appends new tabs. */
function reconcileLayout(saved: number[][] | null, accounts: Account[]): number[][] {
    const liveIds = new Set(accounts.map(a => a.id));
    const placed = new Set<number>();
    const result: number[][] = [];
    for (const group of saved ?? []) {
        if (!Array.isArray(group)) continue;
        const valid = group.filter(id => liveIds.has(id) && !placed.has(id));
        if (valid.length > 0) {
            result.push(valid);
            valid.forEach(id => placed.add(id));
        }
    }
    accounts.forEach(a => { if (!placed.has(a.id)) result.push([a.id]); });
    return result;
}

function App() {
    // -------------------------------------------------------------------------
    // COMPONENT STATE LOGIC
    // -------------------------------------------------------------------------

    // Hosted database connection (null => show the connect screen)
    const [dbConfig, setDbConfig] = useState<DbConfig | null>(() => loadDbConfig());
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Offline-first repository for the connected database, and what it currently shows
    const [repo, setRepo] = useState<SyncedRepo | null>(null);
    const [view, setView] = useState<RepoView>(EMPTY_VIEW);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(IDLE_STATUS);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    const accounts = view.accounts;
    const transactions = view.transactions;
    const layout = useMemo(() => reconcileLayout(view.layout, view.accounts), [view]);

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

    // UI toggles
    const [isLedgerOpen, setIsLedgerOpen] = useState(false);

    // Edit account states
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);

    // -------------------------------------------------------------------------
    // OFFLINE COPY & SYNCHRONIZATION
    // -------------------------------------------------------------------------

    // Open this device's offline copy for the configured database, show it
    // immediately (works with no connection), then keep it synced in the background.
    useEffect(() => {
        if (!dbConfig) {
            setRepo(null);
            setView(EMPTY_VIEW);
            setSyncStatus(IDLE_STATUS);
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        const r = new SyncedRepo(
            new IndexedDbStore(localStoreNameFor(dbConfig.url)),
            createClient({ url: dbConfig.url, authToken: dbConfig.authToken }),
        );
        setIsLoading(true);
        const unsubscribe = r.subscribe(() => {
            if (cancelled) return;
            setView(r.getView());
            setSyncStatus(r.getStatus());
        });
        r.init()
            .then(() => {
                if (cancelled) return;
                setRepo(r);
                setView(r.getView());
                setSyncStatus(r.getStatus());
                setIsLoading(false);
                r.startAutoSync();
            })
            .catch((err) => {
                console.error(err);
                if (cancelled) return;
                setErrorMsg(`Could not open the offline copy on this device: ${friendlyError(err)}`);
                setIsLoading(false);
            });
        // Ask the OS not to evict the offline copy under storage pressure.
        navigator.storage?.persist?.().catch(() => undefined);
        return () => {
            cancelled = true;
            unsubscribe();
            r.stop();
        };
    }, [dbConfig]);

    /** Saves the tab grouping/order (offline copy first, then synced to every device). */
    const persistLayout = (newLayout: number[][]) => {
        repo?.saveLayout(newLayout).catch(err => setErrorMsg(err?.message || 'Failed to save the layout.'));
    };

    const syncNow = () => {
        repo?.sync();
    };

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

        window.addEventListener('scroll', handleScroll, { passive: true });
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
    // Total = sum of all account balances
    const totalBalance = accounts.reduce((acc, account) => acc + account.balance, 0);

    // -------------------------------------------------------------------------
    // DATABASE CONNECTION HANDLERS
    // -------------------------------------------------------------------------

    /**
     * Validates new credentials against the live database (and upgrades its
     * tables if needed) before storing them. Needs a connection the first time.
     */
    const handleConnect = async (cfg: DbConfig) => {
        const probe = createClient({ url: cfg.url, authToken: cfg.authToken });
        try {
            await probe.execute('SELECT 1');
            await ensureRemoteSchema(probe);
        } catch (err) {
            throw new Error(friendlyError(err));
        } finally {
            probe.close();
        }
        saveDbConfig(cfg);
        setErrorMsg('');
        setIsSettingsOpen(false);
        setDbConfig(cfg);
    };

    const handleDisconnect = async () => {
        const pending = syncStatus.pending;
        const question = pending > 0
            ? `${pending} change${pending === 1 ? ' has' : 's have'} not been uploaded from this device yet and will be lost.\n\nDisconnect anyway?`
            : 'Disconnect from the database on this device?\n\nYour data stays safe in the cloud; only the offline copy on this device is removed.';
        if (!window.confirm(question)) return;
        const current = repo;
        clearDbConfig();
        setIsSettingsOpen(false);
        setDbConfig(null);
        try {
            await current?.destroyLocalCopy();
        } catch (err) {
            console.error('Failed to remove the offline copy', err);
        }
    };

    const requireRepo = (): SyncedRepo => {
        if (!repo) throw new Error('The offline copy is still loading. Try again in a moment.');
        return repo;
    };

    // -------------------------------------------------------------------------
    // ACTION HANDLERS (all instant and offline-capable; uploads happen in the background)
    // -------------------------------------------------------------------------

    const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newAccName.trim()) {
            setErrorMsg('Please specify a valid name for the new place of money.');
            return;
        }
        try {
            setIsCreatingAcc(true);
            setErrorMsg('');
            await requireRepo().addAccount(newAccName.trim(), parseFloat(newAccBalance) || 0, newAccIcon);
            setNewAccName('');
            setNewAccBalance('');
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to setup new tab.');
        } finally {
            setIsCreatingAcc(false);
        }
    };

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
            await requireRepo().adjustAccount(accountId, finalAmount, note);
            setAdjustAmounts(prev => ({ ...prev, [accountId]: '' }));
            setAdjustNotes(prev => ({ ...prev, [accountId]: '' }));
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to update balance.');
        } finally {
            setAdjustingId(null);
        }
    };

    const handleDeleteAccount = async (accountId: number, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the "${name}" tab?`)) return;
        try {
            await requireRepo().deleteAccount(accountId);
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to delete place tab.');
        }
    };

    /** Throws on failure so the edit dialog can show the message. */
    const handleEditAccount = async (accountId: number, name: string, icon: string) => {
        await requireRepo().updateAccount(accountId, name, icon);
    };

    const handleDeleteTransaction = async (txId: number) => {
        try {
            await requireRepo().deleteTransaction(txId);
        } catch (err: any) {
            setErrorMsg(err?.message || 'Failed to remove trace record.');
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
                persistLayout(newLayout);
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

        persistLayout(newLayout);
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
            persistLayout(newLayout);
        }
        handleDragEnd();
    };

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------

    return (
        <div
            className="relative flex flex-col items-center bg-neutral-950 selection:bg-emerald-500 selection:text-neutral-950 px-3 py-4 sm:p-4 md:p-8 min-h-screen font-sans text-neutral-100 overflow-x-hidden"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOutside}
        >
            {/* Background Ambient Glows for Glassmorphism */}
            <div className="-top-12 left-1/4 absolute bg-emerald-500/10 blur-[130px] rounded-full w-96 h-96 pointer-events-none"></div>
            <div className="top-1/3 right-1/4 absolute bg-indigo-500/5 blur-[160px] rounded-full w-96 h-96 pointer-events-none"></div>
            <div className="bottom-1/4 left-1/3 absolute bg-teal-500/5 blur-[130px] rounded-full w-80 h-80 pointer-events-none"></div>

            {/* Premium Fixed Horizontal Scroll Progress Bar */}
            <div className="top-0 left-0 z-50 fixed bg-neutral-900/60 backdrop-blur-xs w-full h-1">
                <div
                    className="bg-linear-to-r from-emerald-500 via-teal-400 to-indigo-500 h-full"
                    style={{ width: `${scrollProgress}%` }}
                ></div>
            </div>

            <div className="z-10 space-y-6 sm:space-y-8 mx-auto w-full max-w-5xl">
                <Header
                    accountsCount={accounts.length}
                    syncStatus={syncStatus}
                    onSyncNow={syncNow}
                    onOpenLedger={() => setIsLedgerOpen(true)}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                />

                {errorMsg && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-500/10 backdrop-blur-md shadow-2xl shadow-rose-950/20 p-4 border border-rose-500/15 rounded-2xl text-rose-400 text-sm animate-fade-in w-full">
                        <span className="font-medium wrap-break-word">{errorMsg}</span>
                        <button
                            onClick={() => setErrorMsg('')}
                            className="bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/10 text-rose-300 font-bold text-xs px-3 py-1.5 rounded-lg active:scale-[0.98] transition-all cursor-pointer w-max shrink-0"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <HeroBanner accounts={accounts} totalBalance={totalBalance} />

                {dbConfig && view.neverSynced && accounts.length === 0 && (syncStatus.state === 'offline' || syncStatus.state === 'error') && (
                    <div className="bg-amber-500/10 p-4 border border-amber-500/20 rounded-2xl text-amber-300 text-sm">
                        <p className="font-bold">This device has not downloaded your data yet.</p>
                        <p className="mt-1 text-amber-200/70 text-xs leading-relaxed">
                            {syncStatus.error} It needs to connect once; after that the app works offline and syncs whenever a connection is available.
                        </p>
                    </div>
                )}

                {(isLoading || (view.neverSynced && syncStatus.state === 'syncing')) && accounts.length === 0 ? (
                    <div className="flex flex-col justify-center items-center space-y-3 py-16 text-neutral-500">
                        <svg className="w-8 h-8 text-emerald-500 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="font-medium text-xs">Loading tracking layout...</p>
                    </div>
                ) : (
                    <>
                        {layout.length === 0 ? (
                            <div className="flex flex-col justify-center items-center bg-neutral-900/10 backdrop-blur-md my-4 p-10 border border-neutral-800 border-dashed rounded-3xl text-center shadow-xl">
                                <div className="flex justify-center items-center bg-neutral-950/60 mb-3 border border-neutral-800/80 rounded-full w-14 h-14 text-2xl">
                                    📭
                                </div>
                                <h3 className="font-bold text-neutral-200 text-base">No Separate Money Tabs Found</h3>
                                <p className="mt-1 max-w-md text-neutral-500 text-xs leading-relaxed">
                                    Your multi-tabbed layout is currently empty. Use the <strong>"Add New Place Tab"</strong> module below to create discrete places/sources of money (e.g., Main Bank, Wallet Cash) and track them independently.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6 sm:gap-8 w-full">
                                {layout.map((group, groupIndex) => {
                                    const groupAccounts = group.map(id => accounts.find(a => a.id === id)).filter(Boolean) as Account[];
                                    if (groupAccounts.length === 0) return null;
                                    const groupTotal = groupAccounts.reduce((acc, a) => acc + a.balance, 0);

                                    return (
                                        <div
                                            key={`group-${groupIndex}`}
                                            className={`relative flex flex-col transition-all duration-500 rounded-4xl ${groupAccounts.length > 1 ? 'p-3 sm:p-6 md:p-8 bg-neutral-900/10 backdrop-blur-md shadow-2xl shadow-black/80 border border-neutral-800/50' : ''} ${dragOverGroupIndex === groupIndex && dragOverTabIndex === null ? 'ring-2 ring-emerald-500 scale-[1.01] bg-neutral-800/20' : ''}`}
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
                                                <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 mb-4 sm:mb-6 px-2">
                                                    <div className="flex items-center gap-3 font-bold text-neutral-400 text-sm uppercase tracking-wider">
                                                        Merged Group Total
                                                    </div>
                                                    <div className={`text-xl sm:text-2xl font-black tracking-tight ${groupTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        ₹{groupTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="gap-4 sm:gap-6 grid grid-cols-1 md:grid-cols-2 w-full">
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
                                                            onEdit={(acc) => {
                                                                setEditingAccount(acc);
                                                                setIsEditingModalOpen(true);
                                                            }}
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

            <EditAccountModal
                isOpen={isEditingModalOpen}
                onClose={() => {
                    setIsEditingModalOpen(false);
                    setEditingAccount(null);
                }}
                account={editingAccount}
                onSave={handleEditAccount}
            />

            {/* First-launch connect screen, or the settings dialog when already connected */}
            {(!dbConfig || isSettingsOpen) && (
                <ConnectDatabase
                    current={dbConfig}
                    onConnect={handleConnect}
                    onDisconnect={dbConfig ? handleDisconnect : undefined}
                    onClose={dbConfig ? () => setIsSettingsOpen(false) : undefined}
                />
            )}
        </div>
    );
}

export default App;
