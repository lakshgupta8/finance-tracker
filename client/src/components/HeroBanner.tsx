import { LayoutDashboard } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Account } from '../types';

interface HeroBannerProps {
    accounts: Account[];
    totalBalance: number;
}

export function HeroBanner({ accounts, totalBalance }: HeroBannerProps) {
    return (
        <div className="group relative bg-neutral-900/35 backdrop-blur-lg border border-white/[0.04] shadow-2xl p-6 md:p-8 rounded-4xl overflow-hidden">
            <div className="-top-32 -right-32 absolute bg-emerald-500/15 group-hover:bg-emerald-500/25 blur-[110px] rounded-full w-96 h-96 transition-all duration-700 pointer-events-none"></div>
            <div className="-bottom-32 -left-32 absolute bg-teal-500/10 blur-[110px] rounded-full w-96 h-96 pointer-events-none"></div>

            <div className="z-10 relative flex md:flex-row flex-col justify-between items-center gap-8">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 font-medium text-neutral-400 text-sm uppercase tracking-wide">
                        <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                        <span>Overall Combined Total</span>
                    </div>
                    <div className={`text-5xl md:text-6xl font-extrabold tracking-tight transition-all duration-300 ${totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ₹{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <p className="mt-4 max-w-sm text-neutral-400 text-sm leading-relaxed">
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
                                    contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px' }}
                                    itemStyle={{ color: '#34d399', fontWeight: 'bold' }}
                                    formatter={(value) => [`₹${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Balance']}
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
    );
}
