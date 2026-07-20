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
        <div className="bg-yellow-100 rounded-xl border border-slate-200/80 shadow-sm p-4 mb-6">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 md:gap-2">
                {steps.map((step, idx) => {
                    const isActive = path === step.path;
                    const isPassed = steps.findIndex(s => s.path === path) > idx;
                    const Icon = step.icon;

                    return (
                        <div key={step.path} className="flex-1 flex items-center">
                            <Link
                                to={step.path}
                                className={`flex-1 flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                    isActive
                                        ? 'bg-indigo-50 border-l-4 border-l-indigo-600 border-y-indigo-200 border-r-indigo-200 shadow-md shadow-indigo-600/5'
                                        : isPassed
                                        ? 'bg-emerald-50/70 border-l-4 border-l-emerald-500 border-y-emerald-200 border-r-emerald-200'
                                        : 'bg-slate-50 border-l-4 border-l-slate-300 border-y-slate-200 border-r-slate-200 opacity-60 hover:opacity-100'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all flex-shrink-0 ${
                                    isActive
                                        ? 'bg-indigo-600 border-indigo-400 text-white font-bold shadow-md shadow-indigo-600/30 scale-105'
                                        : isPassed
                                        ? 'bg-emerald-500 border-emerald-400 text-white shadow-sm shadow-emerald-500/20'
                                        : 'bg-slate-100 border-slate-300 text-slate-400'
                                }`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-sm font-bold truncate ${
                                        isActive ? 'text-indigo-950' : isPassed ? 'text-emerald-950' : 'text-slate-600'
                                    }`}>
                                        {step.label}
                                    </span>
                                    <span className={`text-xs truncate ${
                                        isActive ? 'text-indigo-700 font-medium' : isPassed ? 'text-emerald-700 font-medium' : 'text-slate-400'
                                    }`}>
                                        {step.description}
                                    </span>
                                </div>
                            </Link>
                            {idx < steps.length - 1 && (
                                <div className={`hidden md:flex items-center justify-center px-3 ${
                                    isPassed ? 'text-emerald-500' : isActive ? 'text-indigo-400' : 'text-slate-300'
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

