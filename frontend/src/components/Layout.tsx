import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { PipelineStepper } from './PipelineStepper';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="h-screen bg-slate-100 flex flex-col overflow-hidden">
            <Header />
            <div className="flex pt-20 flex-1 overflow-hidden">
                <Sidebar />
                {/* Main container: full remaining height, column layout, frozen */}
                <main className="flex-1 ml-0 md:ml-64 flex flex-col overflow-hidden transition-all duration-300">
                    {/* Fixed stepper banner container at the top of content area */}
                    <div className="px-8 pt-6 pb-2 flex-shrink-0 bg-slate-100">
                        <PipelineStepper />
                    </div>
                    {/* Only the inner content scrolls */}
                    <div className="flex-1 overflow-y-auto px-8 pb-20">
                        {children}
                    </div>
                </main>
            </div>


            {/* Footer - Responsive left margin */}
            <footer className="fixed bottom-0 left-0 md:left-64 right-0 bg-gray-50 border-t border-slate-200 py-2 px-8 text-center z-10 transition-all duration-300">
                <div className="flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 italic">
                    <p>© Jentyx. All rights reserved.</p>
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
