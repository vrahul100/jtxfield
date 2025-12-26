import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Sidebar() {
    const { user } = useAuth();

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${isActive
            ? 'bg-primary-50 text-primary-700 font-medium'
            : 'text-gray-700 hover:bg-gray-100'
        }`;

    return (
        <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-16 overflow-y-auto">
            <nav className="p-4 space-y-1">
                {/* OM & SU Links */}
                <NavLink to="/worklog" className={navLinkClass}>
                    <span className="text-xl">📋</span>
                    <span>Worklog</span>
                </NavLink>

                <NavLink to="/members" className={navLinkClass}>
                    <span className="text-xl">👥</span>
                    <span>Members</span>
                </NavLink>

                <NavLink to="/projects" className={navLinkClass}>
                    <span className="text-xl">📁</span>
                    <span>Projects</span>
                </NavLink>

                <NavLink to="/inbox" className={navLinkClass}>
                    <span className="text-xl">📥</span>
                    <span>Inbox</span>
                </NavLink>

                {/* SU Only Links */}
                {user?.role === 'SU' && (
                    <>
                        <div className="pt-4 pb-2">
                            <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Admin
                            </div>
                        </div>

                        <NavLink to="/nodes" className={navLinkClass}>
                            <span className="text-xl">🏢</span>
                            <span>Nodes</span>
                        </NavLink>

                        <NavLink to="/users" className={navLinkClass}>
                            <span className="text-xl">🔐</span>
                            <span>Users</span>
                        </NavLink>
                    </>
                )}
            </nav>
        </aside>
    );
}
