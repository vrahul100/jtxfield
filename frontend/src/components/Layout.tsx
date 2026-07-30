import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PipelineStepper } from './PipelineStepper';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="h-dvh max-h-dvh bg-slate-100 flex flex-col overflow-hidden">
            <Header />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <Sidebar />

                <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                    <div className="px-3 sm:px-6 md:px-8 pt-3 md:pt-6 pb-2 flex-shrink-0 bg-slate-100">
                        <PipelineStepper />
                    </div>

                    {/*
                      Single scrollport.
                      - Normal pages grow and scroll here.
                      - Fill-height pages (Tickets) use flex-1 + min-h-0 + overflow-hidden.
                    */}
                    <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col px-3 sm:px-6 md:px-8 pb-6">
                        {children}
                    </main>

                    <footer className="flex-shrink-0 bg-gray-50 border-t border-slate-200 py-2 px-4 md:px-8 text-center">
                        <div className="flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 italic">
                            <p>© Jentyx. All rights reserved.</p>
                            <div className="flex gap-4 mt-1 md:mt-0">
                                <a href="#" className="hover:text-blue-600 transition-colors">Terms of Service</a>
                                <a href="#" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
                                <a href="#" className="hover:text-blue-600 transition-colors">Support</a>
                            </div>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}
