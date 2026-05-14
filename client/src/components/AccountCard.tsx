import { GripHorizontal, Trash2, Plus, Minus } from 'lucide-react';
import type { Account } from '../types';
import { getIconComponent } from '../utils/icons';

interface AccountCardProps {
    account: Account;
    groupIndex: number;
    tabIndex: number;
    isOddAndLast: boolean;
    isGrouped: boolean;
    isAdjusting: boolean;
    amountVal: string;
    noteVal: string;
    isDragged: boolean;
    isDragOver: boolean;
    setAdjustAmounts: (val: string) => void;
    setAdjustNotes: (val: string) => void;
    handleAdjustBalance: (accountId: number, isAdd: boolean) => void;
    handleDeleteAccount: (accountId: number, accountName: string) => void;
    handleDragStart: (gIdx: number, tIdx: number) => void;
    handleDragEnd: () => void;
    handleDragEnter: (gIdx: number, tIdx: number) => void;
    handleDrop: (gIdx: number, tIdx: number) => void;
}

export function AccountCard({
    account,
    groupIndex,
    tabIndex,
    isOddAndLast,
    isGrouped,
    isAdjusting,
    amountVal,
    noteVal,
    isDragged,
    isDragOver,
    setAdjustAmounts,
    setAdjustNotes,
    handleAdjustBalance,
    handleDeleteAccount,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDrop
}: AccountCardProps) {
    const IconCmp = getIconComponent(account.icon);

    return (
        <div
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
                ${isOddAndLast && isGrouped ? 'md:col-span-2' : 'col-span-1'}
                ${isDragged ? 'opacity-40 border-dashed border-slate-600 scale-95' : 'hover:shadow-[inset_-2px_-2px_4px_rgba(255,255,255,0.02),inset_2px_2px_4px_rgba(0,0,0,0.5)] hover:-translate-y-1'}
                ${isDragOver ? 'ring-2 ring-teal-500 bg-slate-800/40' : ''}`}
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
                                onChange={(e) => setAdjustAmounts(e.target.value)}
                                className="bg-slate-900/80 py-2.5 pr-3 pl-8 border border-slate-800 focus:border-teal-500 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 w-full font-medium text-slate-200 text-sm transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-slate-600 [appearance:textfield]"
                            />
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                            <input
                                type="text"
                                placeholder="Note (optional)"
                                value={noteVal}
                                onChange={(e) => setAdjustNotes(e.target.value)}
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
}
