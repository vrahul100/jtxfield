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
        <header className="bg-white border-b border-slate-200 h-20 flex items-center px-4 md:px-8 fixed top-0 left-0 right-0 z-10 shadow-sm">
            <div className="flex items-center justify-between w-full">
                {/* Logo */}
                <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl flex items-center justify-center">
                        <img src="logo.png" alt="" className="w-10 h-10 md:w-14 md:h-14" />
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Jentyx</h1>
                        <p className="text-xs md:text-sm text-slate-500">Work</p>
                    </div>
                </div>

                {/* Right side - User info & logout */}
                {user && (
                    <div className="flex items-center gap-2 md:gap-5 flex-shrink-0">
                        {/* Weekly Billable */}
                        {weeklyBillable !== null && (
                            <div className="hidden lg:flex items-center gap-1 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-green-700 font-semibold mr-1">
                                <DollarSign className="w-4 h-4" />
                                <span>{weeklyBillable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-xs text-green-600 font-normal ml-1">This Week</span>
                            </div>
                        )}
                        {/* Hide user text info on mobile */}
                        <div className="text-right hidden md:block">
                            <div className="text-base font-semibold text-slate-900">{user.fullName || user.email}</div>
                            <div className="text-sm text-slate-500 flex items-center justify-end gap-1">
                                {user.role === 'SU' ? (
                                    <>
                                        <Zap className="w-4 h-4" />
                                        <span>Super User</span>
                                    </>
                                ) : (
                                    <>
                                        <Building className="w-4 h-4" />
                                        <span>Office Manager</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Avatar - always visible */}
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center text-white font-bold text-base md:text-lg flex-shrink-0">
                            {(user.fullName || user.email).charAt(0).toUpperCase()}
                        </div>
                        {/* Logout button - icon only on mobile */}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-2 md:px-4 py-2 text-base text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="hidden md:inline">Logout</span>
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
