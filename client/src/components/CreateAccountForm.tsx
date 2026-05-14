import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { PRESET_ICONS, getIconComponent } from '../utils/icons';

interface CreateAccountFormProps {
    newAccName: string;
    setNewAccName: (name: string) => void;
    newAccBalance: string;
    setNewAccBalance: (bal: string) => void;
    newAccIcon: string;
    setNewAccIcon: (icon: string) => void;
    isCreatingAcc: boolean;
    handleCreateAccount: (e: FormEvent<HTMLFormElement>) => void;
}

export function CreateAccountForm({
    newAccName, setNewAccName,
    newAccBalance, setNewAccBalance,
    newAccIcon, setNewAccIcon,
    isCreatingAcc, handleCreateAccount
}: CreateAccountFormProps) {
    return (
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
    );
}
