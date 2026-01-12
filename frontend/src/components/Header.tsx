import { useAuth } from '../hooks/useAuth';
import { Building2, LogOut, Zap, Building } from 'lucide-react';

export function Header() {
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-6 fixed top-0 left-0 right-0 z-10 shadow-sm">
            <div className="flex items-center justify-between w-full">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                        <img src="logo.png" alt="" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Jentyx</h1>
                        <p className="text-sm text-slate-500">Work Capture</p>
                    </div>
                </div>

                {/* Right side - User info & logout */}
                {user && (
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">{user.fullName || user.email}</div>
                            <div className="text-xs text-slate-500 flex items-center justify-end gap-1">
                                {user.role === 'SU' ? (
                                    <>
                                        <Zap className="w-3 h-3" />
                                        <span>Super User</span>
                                    </>
                                ) : (
                                    <>
                                        <Building className="w-3 h-3" />
                                        <span>Office Manager</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="w-10 h-10 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {(user.fullName || user.email).charAt(0).toUpperCase()}
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Logout</span>
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
