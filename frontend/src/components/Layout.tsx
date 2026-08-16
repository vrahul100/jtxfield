import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PipelineStepper } from './PipelineStepper';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="h-screen max-h-screen bg-slate-100 flex flex-col overflow-hidden">
            <Header />
            <div className="flex pt-14 flex-1 min-h-0 overflow-hidden">
                <Sidebar />
                {/* Main container */}
                <main className="flex-1 ml-0 md:ml-64 flex flex-col h-full min-h-0 overflow-hidden transition-all duration-300">
                    {/* Stepper container */}
                    <div className="px-3 sm:px-6 pt-2 pb-1 flex-shrink-0 bg-slate-100">
                        <PipelineStepper />
                    </div>
                    {/* Inner content container */}
                    <div className="flex-1 flex flex-col min-h-0 px-3 sm:px-6 pb-2 overflow-hidden">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
