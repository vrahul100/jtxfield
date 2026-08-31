import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogOut, Zap, Building, DollarSign } from 'lucide-react';

export function Header() {
    const { user, logout } = useAuth();
    const [weeklyBillable, setWeeklyBillable] = useState<number | null>(null);

    useEffect(() => {
        if (user) {
            fetch('/api/reports/header-stats')
                .then(r => r.json())
                .then(d => {
                    if (d.weeklyBillable !== undefined) setWeeklyBillable(d.weeklyBillable);
                })
                .catch(console.error);
        }
    }, [user]);

    const handleLogout = async () => {
        try {
            await logout();
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <header className="bg-white border-b border-slate-200 h-14 flex items-center px-3 sm:px-6 fixed top-0 left-0 right-0 z-20 shadow-xs">
            <div className="flex items-center justify-between w-full">
                {/* Logo */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                        <img src="logo.png" alt="" className="w-8 h-8 object-contain" />
                    </div>
                    <div className="hidden sm:flex items-baseline gap-1.5">
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Jentyx</h1>
                        <span className="text-xs font-medium text-slate-500">Field Operations</span>
                    </div>
                </div>

                {/* Right side - User info & logout */}
                {user && (
                    <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                        {/* Weekly Billable */}
                        {weeklyBillable !== null && (
                            <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-700 text-xs font-semibold">
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>{weeklyBillable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-[10px] text-emerald-600 font-medium ml-0.5 hidden md:inline">This Week</span>
                            </div>
                        )}
                        {/* User info */}
                        <div className="text-right hidden md:block">
                            <div className="text-xs font-semibold text-slate-900 leading-tight">{user.fullName || user.email}</div>
                            <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1">
                                {user.role === 'SU' ? (
                                    <>
                                        <Zap className="w-3 h-3 text-amber-500" />
                                        <span>Super User</span>
                                    </>
                                ) : (
                                    <>
                                        <Building className="w-3 h-3 text-slate-400" />
                                        <span>Office Manager</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Avatar */}
                        <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-slate-700 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-xs">
                            {(user.fullName || user.email).charAt(0).toUpperCase()}
                        </div>
                        {/* Logout button */}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden md:inline">Logout</span>
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
