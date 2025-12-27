import { useAuth } from '../hooks/useAuth';

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
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">JTX Field</h1>
                        <p className="text-xs text-slate-500 -mt-0.5">Construction Management</p>
                    </div>
                </div>

                {/* Right side - User info & logout */}
                {user && (
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">{user.fullName || user.email}</div>
                            <div className="text-xs text-slate-500">
                                {user.role === 'SU' ? '⚡ Super User' : '🏢 Office Manager'}
                            </div>
                        </div>
                        <div className="w-10 h-10 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {(user.fullName || user.email).charAt(0).toUpperCase()}
                        </div>
                        <button
                            onClick={handleLogout}
                            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                        >
                            Logout
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
