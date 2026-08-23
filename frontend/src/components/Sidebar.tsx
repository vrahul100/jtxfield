import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    Users,
    FolderKanban,
    Building2,
    Shield,
    ChartBar,
    Menu,
    Settings2,
    BadgeDollarSign
} from 'lucide-react';

export function Sidebar() {
    const { user } = useAuth();
    const location = useLocation();
    const path = location.pathname;
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const pipelineSteps = [
        { path: '/tickets', stepNum: 1, label: 'Daily Logs', sub: 'Review & Classify' },
        { path: '/timesheets', stepNum: 2, label: 'Timesheets', sub: 'Verify Payroll' },
        { path: '/copackets', stepNum: 3, label: 'Change Orders', sub: 'GC Billing' },
    ];

    const getStepState = (targetPath: string) => {
        const order = ['/tickets', '/timesheets', '/copackets'];
        const currentIdx = order.indexOf(path);
        const targetIdx = order.indexOf(targetPath);
        if (targetPath === path) return 'active';
        if (currentIdx !== -1 && targetIdx < currentIdx) return 'passed';
        return 'pending';
    };

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



    return (
        <>
            {/* Mobile Hamburger Button - Fixed Position */}
            {isMobile && (
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="fixed left-4 top-16 z-50 p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
                    aria-label="Toggle menu"
                >
                    <Menu className="w-5 h-5" />
                </button>
            )}

            {/* Overlay for mobile when expanded */}
            {isMobile && !isCollapsed && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 top-14"
                    onClick={() => setIsCollapsed(true)}
                />
            )}

            <aside
                className={`${
                    isMobile 
                        ? (isCollapsed ? '-translate-x-full' : 'translate-x-0')
                        : (isCollapsed ? 'w-16' : 'w-64')
                } ${isMobile ? 'w-64' : ''} bg-slate-900 h-[calc(100vh-3.5rem)] fixed left-0 top-14 overflow-y-auto transition-all duration-300 ease-in-out z-40`}
            >
                <nav className="p-4 pt-6 space-y-4">
                    {/* Pipeline Section */}
                    {!isCollapsed && (
                        <div className="px-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                Field Pipeline
                            </span>
                        </div>
                    )}

                    <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/60 shadow-lg relative space-y-2">
                        {pipelineSteps.map((step) => {
                            const state = getStepState(step.path);
                            const isActive = state === 'active';
                            const isPassed = state === 'passed';

                            return (
                                <NavLink
                                    key={step.path}
                                    to={step.path}
                                    title={step.label}
                                    onClick={() => isMobile && setIsCollapsed(true)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all relative z-10 ${
                                        isActive
                                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 border-indigo-400/80 text-white shadow-lg shadow-indigo-900/50'
                                            : isPassed
                                            ? 'bg-emerald-600/90 border-emerald-500/80 text-white shadow-md shadow-emerald-900/40'
                                            : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60 hover:text-white hover:border-slate-600'
                                    }`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-extrabold transition-all flex-shrink-0 ${
                                        isActive
                                            ? 'bg-white text-indigo-700 border-white shadow-sm'
                                            : isPassed
                                            ? 'bg-white text-emerald-700 border-white shadow-sm'
                                            : 'bg-slate-800 border-slate-600 text-slate-300'
                                    }`}>
                                        {step.stepNum}
                                    </div>
                                    <div className={`flex flex-col min-w-0 ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>
                                        <span className={`text-sm font-bold tracking-tight truncate ${
                                            isActive || isPassed ? 'text-white' : 'text-slate-100'
                                        }`}>
                                            {step.label}
                                        </span>
                                        <span className={`text-[11px] truncate ${
                                            isActive ? 'text-indigo-200 font-medium' : isPassed ? 'text-emerald-100 font-medium' : 'text-slate-400'
                                        }`}>
                                            {step.sub}
                                        </span>
                                    </div>
                                </NavLink>
                            );
                        })}
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

                        <NavLink to="/rate-card" className={navLinkClass} title="Rate Card" onClick={() => isMobile && setIsCollapsed(true)}>
                            <BadgeDollarSign className="w-5 h-5 flex-shrink-0" />
                            <span className={`text-base ${!isMobile && isCollapsed ? 'hidden' : 'block'}`}>Rate Card</span>
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
