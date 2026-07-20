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
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-6">
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
                                        ? 'bg-indigo-50 border-indigo-200 shadow-sm text-indigo-900'
                                        : isPassed
                                        ? 'bg-emerald-50/50 border-emerald-100 text-slate-700 hover:bg-slate-50'
                                        : 'bg-slate-50/50 border-slate-100 text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                                    isActive
                                        ? 'bg-indigo-600 border-indigo-400 text-white font-bold'
                                        : isPassed
                                        ? 'bg-emerald-500 border-emerald-400 text-white'
                                        : 'bg-slate-200 border-slate-300 text-slate-600'
                                }`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-sm font-semibold truncate ${isActive ? 'text-indigo-900' : 'text-slate-900'}`}>
                                        {step.label}
                                    </span>
                                    <span className="text-xs text-slate-500 truncate">
                                        {step.description}
                                    </span>
                                </div>
                            </Link>
                            {idx < steps.length - 1 && (
                                <div className="hidden md:flex items-center justify-center px-3 text-slate-300">
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
