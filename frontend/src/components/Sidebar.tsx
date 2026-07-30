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
    Settings2
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

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) {
                setIsCollapsed(true);
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

    const showLabels = isMobile || !isCollapsed;

    return (
        <>
            {isMobile && (
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="fixed left-4 top-24 z-50 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
                    aria-label="Toggle menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
            )}

            {isMobile && !isCollapsed && (
                <div
                    className="fixed inset-0 bg-black/50 z-30"
                    onClick={() => setIsCollapsed(true)}
                />
            )}

            <aside
                className={[
                    'bg-slate-900 overflow-y-auto overscroll-contain transition-all duration-300 ease-in-out z-40',
                    isMobile
                        ? `fixed inset-y-0 left-0 w-64 ${isCollapsed ? '-translate-x-full' : 'translate-x-0'}`
                        : `relative flex-shrink-0 h-full ${isCollapsed ? 'w-16' : 'w-64'}`,
                ].join(' ')}
            >
                <nav className="p-4 pt-6 space-y-4">
                    {showLabels && (
                        <div className="px-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                Field Pipeline
                            </span>
                        </div>
                    )}

                    <div className="bg-slate-500 rounded-xl p-2 border border-slate-800/80 shadow-inner relative space-y-2">
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
                                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all relative z-10 ${
                                        isActive
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/40'
                                            : isPassed
                                            ? 'bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-600/30'
                                            : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-extrabold transition-all flex-shrink-0 ${
                                        isActive
                                            ? 'bg-white text-indigo-700 border-white shadow-sm'
                                            : isPassed
                                            ? 'bg-white text-emerald-700 border-white shadow-sm'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                        {step.stepNum}
                                    </div>
                                    {showLabels && (
                                        <div className="flex flex-col min-w-0">
                                            <span className={`text-sm font-bold truncate ${
                                                isActive || isPassed ? 'text-white' : 'text-slate-200'
                                            }`}>
                                                {step.label}
                                            </span>
                                            <span className={`text-[10px] truncate ${
                                                isActive ? 'text-indigo-100 font-medium' : isPassed ? 'text-emerald-100 font-medium' : 'text-slate-400'
                                            }`}>
                                                {step.sub}
                                            </span>
                                        </div>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>

                    {showLabels && (
                        <div className="pt-4 px-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                                Setup & Config
                            </span>
                        </div>
                    )}

                    <div className="space-y-1">
                        <NavLink to="/projects" className={navLinkClass} title="Projects" onClick={() => isMobile && setIsCollapsed(true)}>
                            <FolderKanban className="w-5 h-5 flex-shrink-0" />
                            {showLabels && <span className="text-base">Projects</span>}
                        </NavLink>

                        <NavLink to="/members" className={navLinkClass} title="Members" onClick={() => isMobile && setIsCollapsed(true)}>
                            <Users className="w-5 h-5 flex-shrink-0" />
                            {showLabels && <span className="text-base">Members</span>}
                        </NavLink>

                        <NavLink to="/reports" className={navLinkClass} title="Reports" onClick={() => isMobile && setIsCollapsed(true)}>
                            <ChartBar className="w-5 h-5 flex-shrink-0" />
                            {showLabels && <span className="text-base">Reports</span>}
                        </NavLink>

                        <NavLink to="/integrations" className={navLinkClass} title="Integrations" onClick={() => isMobile && setIsCollapsed(true)}>
                            <Settings2 className="w-5 h-5 flex-shrink-0" />
                            {showLabels && <span className="text-base">Integrations</span>}
                        </NavLink>
                    </div>

                    {user?.role === 'SU' && (
                        <>
                            {showLabels && (
                                <div className="pt-6 pb-2">
                                    <div className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Admin
                                    </div>
                                </div>
                            )}

                            <NavLink to="/nodes" className={navLinkClass} title="Nodes" onClick={() => isMobile && setIsCollapsed(true)}>
                                <Building2 className="w-5 h-5 flex-shrink-0" />
                                {showLabels && <span className="text-base">Nodes</span>}
                            </NavLink>

                            <NavLink to="/users" className={navLinkClass} title="Users" onClick={() => isMobile && setIsCollapsed(true)}>
                                <Shield className="w-5 h-5 flex-shrink-0" />
                                {showLabels && <span className="text-base">Users</span>}
                            </NavLink>
                        </>
                    )}
                </nav>
            </aside>
        </>
    );
}
