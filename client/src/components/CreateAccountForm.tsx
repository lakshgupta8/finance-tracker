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
        <div className="bg-neutral-900/30 backdrop-blur-md border border-white/[0.03] shadow-2xl mx-auto mt-8 p-6 md:p-8 rounded-4xl w-full max-w-3xl">
            <h3 className="flex items-center gap-3 mb-6 font-bold text-neutral-200 text-lg">
                <Plus className="w-5 h-5 text-emerald-400" />
                Add New Place Tab
            </h3>

            <form onSubmit={handleCreateAccount} className="space-y-5">
                <div className="gap-5 grid grid-cols-1 md:grid-cols-2">
                    <div>
                        <label className="block mb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">Place / Account Name</label>
                        <input
                            type="text"
                            placeholder="e.g., Hidden Wallet, Stock Port"
                            value={newAccName}
                            onChange={(e) => setNewAccName(e.target.value)}
                            className="bg-neutral-950/60 px-4 py-3 border border-neutral-800/80 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/20 rounded-xl focus:outline-none w-full text-neutral-200 text-sm transition-all placeholder-neutral-600"
                        />
                    </div>

                    <div>
                        <label className="block mb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">Starting Balance (₹)</label>
                        <input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={newAccBalance}
                            onChange={(e) => setNewAccBalance(e.target.value)}
                            className="bg-neutral-950/60 px-4 py-3 border border-neutral-800/80 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/20 rounded-xl focus:outline-none w-full text-neutral-200 text-sm transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder-neutral-600 [appearance:textfield]"
                        />
                    </div>
                </div>

                <div>
                    <label className="block mb-3 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">Select Tab Icon</label>
                    <div className="flex flex-wrap gap-2">
                        {PRESET_ICONS.map((iconName) => {
                            const IconComponent = getIconComponent(iconName);
                            return (
                                <button
                                    key={iconName}
                                    type="button"
                                    onClick={() => setNewAccIcon(iconName)}
                                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${newAccIcon === iconName
                                        ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 scale-110 shadow-lg shadow-emerald-500/20'
                                        : 'bg-neutral-950 border border-neutral-800/80 hover:border-neutral-700 text-neutral-500 hover:text-neutral-300'
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
                    className="bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-950 font-bold text-sm px-4 py-3 rounded-xl w-full active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-emerald-500/25"
                >
                    {isCreatingAcc ? 'Creating Tab...' : 'Create Separate Tab'}
                </button>
            </form>
        </div>
    );
}
