import { ClipboardList, Clock, FileText, ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function PipelineStepper() {
    const location = useLocation();
    const path = location.pathname;

    // Only show stepper on workflow pages
    const isWorkflowPage = ['/tickets', '/timesheets', '/copackets'].includes(path);
    if (!isWorkflowPage) return null;

    const steps = [
        {
            path: '/tickets',
            label: '1. Daily Logs',
            description: 'Review & Classify Captured Work',
            icon: ClipboardList,
            stepNum: 1,
        },
        {
            path: '/timesheets',
            label: '2. Timesheets',
            description: 'Verify Hours for Payroll',
            icon: Clock,
            stepNum: 2,
        },
        {
            path: '/copackets',
            label: '3. Change Orders',
            description: 'GC Billing & Evidence Packets',
            icon: FileText,
            stepNum: 3,
        },
    ];

    return (
        <div className="bg-slate-100 rounded-xl border border-slate-200 shadow-sm p-2 sm:p-3 mb-3">
            <div className="flex flex-row overflow-x-auto md:overflow-visible items-center justify-between gap-2 md:gap-3 pb-1 md:pb-0">
                {steps.map((step, idx) => {
                    const isActive = path === step.path;
                    const isPassed = steps.findIndex(s => s.path === path) > idx;
                    const Icon = step.icon;

                    return (
                        <div key={step.path} className="flex-1 min-w-[140px] md:min-w-0 flex items-center">
                            <Link
                                to={step.path}
                                className={`flex-1 flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg border transition-all ${
                                    isActive
                                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30'
                                        : isPassed
                                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-sm shadow-emerald-600/20'
                                        : 'bg-slate-200/80 border-slate-300 text-slate-700 hover:bg-slate-300/80'
                                }`}
                            >
                                <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center border transition-all flex-shrink-0 ${
                                    isActive
                                        ? 'bg-white text-indigo-700 border-white font-extrabold shadow-sm'
                                        : isPassed
                                        ? 'bg-white text-emerald-700 border-white font-extrabold shadow-sm'
                                        : 'bg-slate-300 border-slate-400 text-slate-600'
                                }`}>
                                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-xs sm:text-sm font-bold truncate ${
                                        isActive || isPassed ? 'text-white' : 'text-slate-800'
                                    }`}>
                                        {step.label}
                                    </span>
                                    <span className={`text-[10px] sm:text-xs truncate hidden sm:block ${
                                        isActive ? 'text-indigo-100 font-medium' : isPassed ? 'text-emerald-100 font-medium' : 'text-slate-500'
                                    }`}>
                                        {step.description}
                                    </span>
                                </div>
                            </Link>
                            {idx < steps.length - 1 && (
                                <div className={`hidden md:flex items-center justify-center px-1.5 ${
                                    isPassed ? 'text-emerald-500 font-bold' : isActive ? 'text-indigo-500 font-bold' : 'text-slate-400'
                                }`}>
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

