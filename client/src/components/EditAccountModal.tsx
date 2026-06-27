import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X, Save } from 'lucide-react';
import { PRESET_ICONS, getIconComponent } from '../utils/icons';
import type { Account } from '../types';

interface EditAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: Account | null;
    onSave: (id: number, name: string, icon: string) => Promise<void>;
}

export function EditAccountModal({ isOpen, onClose, account, onSave }: EditAccountModalProps) {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('bank');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (account) {
            setName(account.name);
            setIcon(account.icon);
            setErrorMsg('');
        }
    }, [account]);

    if (!isOpen || !account) return null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName) {
            setErrorMsg('Place/Account name cannot be empty.');
            return;
        }

        try {
            setIsSaving(true);
            setErrorMsg('');
            await onSave(account.id, trimmedName, icon);
            onClose();
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.response?.data?.error || 'Failed to update place tab.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
                onClick={onClose}
            />

            {/* Modal Body */}
            <div className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6 bg-neutral-950 border border-neutral-800/80 rounded-3xl shadow-2xl animate-scale-up">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-neutral-200 text-lg flex items-center gap-2">
                        <span>Edit Money Tab</span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="hover:bg-neutral-900 p-2 rounded-xl text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {errorMsg && (
                    <div className="mb-4 bg-rose-500/10 p-3 border border-rose-500/15 rounded-xl text-rose-400 text-xs">
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block mb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">
                            Place / Account Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-neutral-905 px-4 py-3 border border-neutral-800/80 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/20 rounded-xl focus:outline-none w-full text-neutral-200 text-sm transition-all"
                            placeholder="e.g. Cash, Bank Account"
                        />
                    </div>

                    <div>
                        <label className="block mb-3 font-medium text-[11px] text-neutral-500 uppercase tracking-wider">
                            Select Tab Icon
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_ICONS.map((iconName) => {
                                const IconComponent = getIconComponent(iconName);
                                return (
                                    <button
                                        key={iconName}
                                        type="button"
                                        onClick={() => setIcon(iconName)}
                                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                            icon === iconName
                                                ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 scale-105 shadow-md shadow-emerald-500/10'
                                                : 'bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700 text-neutral-500 hover:text-neutral-300'
                                        }`}
                                    >
                                        <IconComponent className="w-4 h-4" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-bold text-sm py-3 rounded-xl transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 flex justify-center items-center gap-2 bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-neutral-950 font-bold text-sm py-3 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-emerald-500/20"
                        >
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
