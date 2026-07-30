import { GripHorizontal, Trash2, Plus, Minus, Pencil } from 'lucide-react';
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
    onEdit: (account: Account) => void;
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
    handleDrop,
    onEdit
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
                bg-neutral-900/40 backdrop-blur-md rounded-3xl border border-white/4 shadow-xl
                ${isOddAndLast && isGrouped ? 'md:col-span-2' : 'col-span-1'}
                ${isDragged ? 'opacity-40 border-dashed border-neutral-600 scale-95' : 'hover:bg-neutral-900/60 hover:border-white/8 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/60'}
                ${isDragOver ? 'ring-2 ring-emerald-500 bg-neutral-800/40' : ''}`}
        >
            <div>
                {/* Tab Identity Header */}
                <div className="flex justify-between items-start gap-3 mb-6">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="mr-1 text-neutral-500 hover:text-emerald-400 transition-colors cursor-grab">
                            <GripHorizontal className="w-5 h-5" />
                        </div>
 
                        <div className="flex justify-center items-center bg-neutral-950/60 shadow-inner border border-neutral-800/80 rounded-2xl w-12 h-12 text-emerald-400 shrink-0">
                            <IconCmp className="w-6 h-6" />
                        </div>
                        <div className="min-w-0 cursor-grab">
                            <h3 className="font-bold text-neutral-200 group-hover/card:text-white text-lg truncate transition-colors">
                                {account.name}
                            </h3>
                            <span className="font-semibold text-[10px] text-neutral-500 uppercase tracking-widest">
                                Money Tab
                            </span>
                        </div>
                    </div>
 
                    {/* Controls Panel */}
                    <div className="flex items-center gap-1.5">
                        {/* Edit Button */}
                        <button
                            type="button"
                            onClick={() => onEdit(account)}
                            title="Edit this tab"
                            className="hover:bg-emerald-500/10 p-2 rounded-xl text-neutral-500 hover:text-emerald-400 transition-all duration-200 cursor-pointer"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>

                        {/* Permanent Remove Button */}
                        <button
                            type="button"
                            onClick={() => handleDeleteAccount(account.id, account.name)}
                            title="Remove this tab"
                            className="hover:bg-rose-500/10 p-2 rounded-xl text-neutral-500 hover:text-rose-400 transition-all duration-200 cursor-pointer"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
 
                {/* Isolated Live Current Balance Counter */}
                <div className="bg-neutral-950/40 mb-6 p-4 border border-white/2 rounded-2xl">
                    <div className="mb-1 font-medium text-neutral-500 text-xs uppercase tracking-wide">Current Balance</div>
                    <div className={`text-3xl font-extrabold tracking-tight ${account.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ₹{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
 
                {/* Dynamic Form Controls: Add or Subtract immediately */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 font-bold text-[11px] text-neutral-500 uppercase tracking-widest">
                        <span>Quick Action</span>
                    </div>
 
                    <div className="gap-3 grid grid-cols-2">
                        <div className="relative col-span-2 sm:col-span-1">
                            <span className="top-1/2 left-4 absolute font-bold text-neutral-500 text-sm -translate-y-1/2">₹</span>
                            <input
                                type="number"
                                step="any"
                                placeholder="Amount"
                                value={amountVal}
                                onChange={(e) => setAdjustAmounts(e.target.value)}
                                className="bg-neutral-950/60 py-2.5 pr-3 pl-8 border border-neutral-800/80 focus:border-emerald-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full font-medium text-neutral-200 text-sm transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-neutral-600 [appearance:textfield]"
                            />
                        </div>
 
                        <div className="col-span-2 sm:col-span-1">
                            <input
                                type="text"
                                placeholder="Note (optional)"
                                value={noteVal}
                                onChange={(e) => setAdjustNotes(e.target.value)}
                                className="bg-neutral-950/60 px-3 py-2.5 border border-neutral-800/80 focus:border-emerald-500/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full font-medium text-neutral-200 text-sm transition-all placeholder-neutral-600"
                            />
                        </div>
                    </div>
 
                    {/* Split Dedicated Inline Trigger Buttons */}
                    <div className="gap-3 grid grid-cols-2 pt-2">
                        <button
                            type="button"
                            disabled={isAdjusting}
                            onClick={() => handleAdjustBalance(account.id, true)}
                            className="flex justify-center items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 px-3 py-2.5 border border-emerald-500/10 hover:border-emerald-500/30 rounded-xl font-bold text-emerald-400 text-sm active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add</span>
                        </button>
 
                        <button
                            type="button"
                            disabled={isAdjusting}
                            onClick={() => handleAdjustBalance(account.id, false)}
                            className="flex justify-center items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 px-3 py-2.5 border border-rose-500/10 hover:border-rose-500/30 rounded-xl font-bold text-rose-400 text-sm active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:pointer-events-none"
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
