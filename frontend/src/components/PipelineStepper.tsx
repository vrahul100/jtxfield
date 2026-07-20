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
        <div className="bg-slate-50 rounded-xl border border-slate-700/80 shadow-lg p-3.5 mb-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {steps.map((step, idx) => {
                    const isActive = path === step.path;
                    const isPassed = steps.findIndex(s => s.path === path) > idx;
                    const Icon = step.icon;

                    return (
                        <div key={step.path} className="flex-1 flex items-center">
                            <Link
                                to={step.path}
                                className={`flex-1 flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                                    isActive
                                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/40 scale-[1.01]'
                                        : isPassed
                                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-600/30'
                                        : 'bg-slate-800/90 border-slate-700 text-slate-300 opacity-70 hover:opacity-100 hover:border-slate-500'
                                }`}
                            >
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all flex-shrink-0 ${
                                    isActive
                                        ? 'bg-white text-indigo-700 border-white font-extrabold shadow-sm'
                                        : isPassed
                                        ? 'bg-white text-emerald-700 border-white font-extrabold shadow-sm'
                                        : 'bg-slate-700 border-slate-600 text-slate-300'
                                }`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-sm font-bold truncate ${
                                        isActive || isPassed ? 'text-white' : 'text-slate-200'
                                    }`}>
                                        {step.label}
                                    </span>
                                    <span className={`text-xs truncate ${
                                        isActive ? 'text-indigo-100 font-medium' : isPassed ? 'text-emerald-100 font-medium' : 'text-slate-400'
                                    }`}>
                                        {step.description}
                                    </span>
                                </div>
                            </Link>
                            {idx < steps.length - 1 && (
                                <div className={`hidden md:flex items-center justify-center px-2 ${
                                    isPassed ? 'text-emerald-400 font-bold' : isActive ? 'text-indigo-400 font-bold' : 'text-slate-600'
                                }`}>
                                    <ArrowRight className="w-5 h-5" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

