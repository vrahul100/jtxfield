import React from 'react';
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
        <header className="bg-white border-b border-gray-200 h-16 flex items-center px-6 fixed top-0 left-0 right-0 z-10">
            <div className="flex items-center justify-between w-full">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">J</span>
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900">JTX Field</h1>
                </div>

                {/* Right side - User info & logout */}
                {user && (
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">{user.fullName || user.email}</div>
                            <div className="text-xs text-gray-500">
                                {user.role === 'SU' ? 'Super User' : 'Office Manager'}
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
