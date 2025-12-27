import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <Header />
            <div className="flex pt-16 flex-1">
                <Sidebar />
                <main className="flex-1 ml-64 p-8 pb-20">
                    {children}
                </main>
            </div>
            {/* Footer */}
            <footer className="ml-64 bg-white border-t border-slate-200 py-4 px-8 text-center">
                <div className="flex flex-col md:flex-row justify-between items-center text-sm text-slate-500">
                    <p>© 2024 JTX Field. All rights reserved.</p>
                    <div className="flex gap-4 mt-2 md:mt-0">
                        <a href="#" className="hover:text-blue-600 transition-colors">Terms of Service</a>
                        <a href="#" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
                        <a href="#" className="hover:text-blue-600 transition-colors">Support</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
