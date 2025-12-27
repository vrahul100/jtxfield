import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Sidebar() {
    const { user } = useAuth();

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
            ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-900/20'
            : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
        }`;

    return (
        <aside className="w-64 bg-slate-900 h-screen fixed left-0 top-16 overflow-y-auto">
            <nav className="p-4 space-y-1">
                {/* OM & SU Links */}
                <NavLink to="/worklog" className={navLinkClass}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span className="text-base">Work Tickets</span>
                </NavLink>

                <NavLink to="/members" className={navLinkClass}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="text-base">Members</span>
                </NavLink>

                <NavLink to="/projects" className={navLinkClass}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-base">Projects</span>
                </NavLink>

                <div className="pt-4">
                    <div className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Coming Soon
                    </div>
                    <div className="opacity-50 cursor-not-allowed">
                        <div className="flex items-center gap-3 px-4 py-3 text-slate-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-base">Rate Card</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3 text-slate-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                            </svg>
                            <span className="text-base">Transactions</span>
                        </div>
                    </div>
                </div>

                {/* SU Only Links */}
                {user?.role === 'SU' && (
                    <>
                        <div className="pt-6 pb-2">
                            <div className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Admin
                            </div>
                        </div>

                        <NavLink to="/nodes" className={navLinkClass}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="text-base">Nodes</span>
                        </NavLink>

                        <NavLink to="/users" className={navLinkClass}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span className="text-base">Users</span>
                        </NavLink>
                    </>
                )}
            </nav>
        </aside>
    );
}
