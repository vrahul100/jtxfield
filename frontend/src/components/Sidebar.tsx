import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    ClipboardList,
    Users,
    FolderKanban,
    DollarSign,
    Receipt,
    Building2,
    Shield
} from 'lucide-react';

export function Sidebar() {
    const { user } = useAuth();

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
            ? 'bg-indigo-200 text-black font-medium shadow-lg shadow-indigo-900/20'
            : 'text-slate-400 hover:bg-slate-300/50 hover:text-white'
        }`;

    return (
        <aside className="w-64 bg-slate-900 h-screen fixed left-0 top-16 overflow-y-auto">
            <nav className="p-4 space-y-1">
                {/* OM & SU Links */}
                <NavLink to="/tickets" className={navLinkClass}>
                    <ClipboardList className="w-5 h-5" />
                    <span className="text-base">Tickets</span>
                </NavLink>

                <NavLink to="/transactions" className={navLinkClass}>
                    <Receipt className="w-5 h-5" />
                    <span className="text-base">Work Logs</span>
                </NavLink>
                <NavLink to="/members" className={navLinkClass}>
                    <Users className="w-5 h-5" />
                    <span className="text-base">Members</span>
                </NavLink>

                <NavLink to="/projects" className={navLinkClass}>
                    <FolderKanban className="w-5 h-5" />
                    <span className="text-base">Projects</span>
                </NavLink>


                {/* SU Only Links */}
                {user?.role === 'SU' && (
                    <>
                        <div className="pt-6 pb-2">
                            <div className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Admin
                            </div>
                        </div>

                        <NavLink to="/nodes" className={navLinkClass}>
                            <Building2 className="w-5 h-5" />
                            <span className="text-base">Nodes</span>
                        </NavLink>

                        <NavLink to="/users" className={navLinkClass}>
                            <Shield className="w-5 h-5" />
                            <span className="text-base">Users</span>
                        </NavLink>
                    </>
                )}
            </nav>
        </aside>
    );
}
