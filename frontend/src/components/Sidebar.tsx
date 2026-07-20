import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    Users,
    FolderKanban,
    Building2,
    Shield,
    ChartBar,
    Menu,
    Settings2
} from 'lucide-react';

export function Sidebar() {
    const { user } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile and auto-collapse
    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) {
                setIsCollapsed(true); // Auto-collapse on mobile
            }
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
            ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-900/20'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`;

    const pipelineLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative z-10 ${isActive
            ? 'bg-indigo-950/40 border border-indigo-500/30 text-white font-semibold shadow-sm'
            : 'text-slate-400 border border-transparent hover:bg-slate-800/40 hover:text-white'
        }`;

    return (
        <>
            {/* Mobile Hamburger Button - Fixed Position */}
            {isMobile && (
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="fixed left-4 top-24 z-50 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
                    aria-label="Toggle menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
            )}

            {/* Overlay for mobile when expanded */}
            {isMobile && !isCollapsed && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 top-20"
                    onClick={() => setIsCollapsed(true)}
                />
            )}

            <aside
                className={`${
                    isMobile 
                        ? (isCollapsed ? '-translate-x-full' : 'translate-x-0')
                        : (isCollapsed ? 'w-16' : 'w-64')
                } ${isMobile ? 'w-64' : ''} bg-slate-900 h-screen fixed left-0 top-20 overflow-y-auto transition-all duration-300 ease-in-out z-40`}
            >
                <nav className="p-4 pt-6 space-y-4">
                    {/* Pipeline Section */}
                    {!isCollapsed && (
                        <div className="px-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                                Field Pipeline
                            </span>
                        </div>
                    )}

                    <div className="relative space-y-2">
                        {/* Connecting Line */}
                        {!isCollapsed && (
                            <div className="absolute left-[27px] top-6 bottom-6 w-[2px] bg-slate-800 z-0" />
                        )}

                        <NavLink to="/tickets" className={pipelineLinkClass} title="Daily Logs" onClick={() => isMobile && setIsCollapsed(true)}>
                            {({ isActive }) => (
                                <>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-bold transition-all flex-shrink-0 ${
                                        isActive
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                        1
                                    </div>
                                    <div className={`flex flex-col min-w-0 ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>
                                        <span className="text-sm font-semibold truncate">Daily Logs</span>
                                        <span className="text-[10px] text-slate-500 font-normal truncate">Review & Classify</span>
                                    </div>
                                </>
                            )}
                        </NavLink>

                        <NavLink to="/timesheets" className={pipelineLinkClass} title="Timesheets" onClick={() => isMobile && setIsCollapsed(true)}>
                            {({ isActive }) => (
                                <>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-bold transition-all flex-shrink-0 ${
                                        isActive
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                        2
                                    </div>
                                    <div className={`flex flex-col min-w-0 ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>
                                        <span className="text-sm font-semibold truncate">Timesheets</span>
                                        <span className="text-[10px] text-slate-500 font-normal truncate">Verify Payroll</span>
                                    </div>
                                </>
                            )}
                        </NavLink>

                        <NavLink to="/copackets" className={pipelineLinkClass} title="Change Orders" onClick={() => isMobile && setIsCollapsed(true)}>
                            {({ isActive }) => (
                                <>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-bold transition-all flex-shrink-0 ${
                                        isActive
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                        3
                                    </div>
                                    <div className={`flex flex-col min-w-0 ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>
                                        <span className="text-sm font-semibold truncate">Change Orders</span>
                                        <span className="text-[10px] text-slate-500 font-normal truncate">GC Billing</span>
                                    </div>
                                </>
                            )}
                        </NavLink>
                    </div>

                    {/* Management Section */}
                    {!isCollapsed && (
                        <div className="pt-4 px-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                                Setup & Config
                            </span>
                        </div>
                    )}

                    <div className="space-y-1">
                        <NavLink to="/projects" className={navLinkClass} title="Projects" onClick={() => isMobile && setIsCollapsed(true)}>
                            <FolderKanban className="w-5 h-5 flex-shrink-0" />
                            <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Projects</span>
                        </NavLink>

                        <NavLink to="/members" className={navLinkClass} title="Members" onClick={() => isMobile && setIsCollapsed(true)}>
                            <Users className="w-5 h-5 flex-shrink-0" />
                            <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Members</span>
                        </NavLink>

                        <NavLink to="/reports" className={navLinkClass} title="Reports" onClick={() => isMobile && setIsCollapsed(true)}>
                            <ChartBar className="w-5 h-5 flex-shrink-0" />
                            <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Reports</span>
                        </NavLink>

                        <NavLink to="/integrations" className={navLinkClass} title="Integrations" onClick={() => isMobile && setIsCollapsed(true)}>
                            <Settings2 className="w-5 h-5 flex-shrink-0" />
                            <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Integrations</span>
                        </NavLink>
                    </div>


                    {/* SU Only Links */}
                    {user?.role === 'SU' && (
                        <>
                            {!isCollapsed && (
                                <div className="pt-6 pb-2">
                                    <div className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Admin
                                    </div>
                                </div>
                            )}

                            <NavLink to="/nodes" className={navLinkClass} title="Nodes" onClick={() => isMobile && setIsCollapsed(true)}>
                                <Building2 className="w-5 h-5 flex-shrink-0" />
                                <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Nodes</span>
                            </NavLink>

                            <NavLink to="/users" className={navLinkClass} title="Users" onClick={() => isMobile && setIsCollapsed(true)}>
                                <Shield className="w-5 h-5 flex-shrink-0" />
                                <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Users</span>
                            </NavLink>
                        </>
                    )}
                </nav>
            </aside>
        </>
    );
}
