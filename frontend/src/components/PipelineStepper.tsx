import { ClipboardList, Clock, FileText } from 'lucide-react';
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
            label: 'Daily Logs',
            icon: ClipboardList,
            stepNum: 1,
        },
        {
            path: '/timesheets',
            label: 'Timesheets',
            icon: Clock,
            stepNum: 2,
        },
        {
            path: '/copackets',
            label: 'Change Orders',
            icon: FileText,
            stepNum: 3,
        },
    ];

    const getClipPath = (idx: number) => {
        if (idx === 0) {
            // First chevron: flat left, pointed right
            return 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)';
        }
        // Subsequent chevrons: inward left cutout, pointed right
        return 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%, 10px 50%)';
    };

    return (
        <nav aria-label="Breadcrumb" className="flex items-center  text-xs py-0.5 mb-1.5 overflow-x-auto select-none">
            {steps.map((step, idx) => {
                const isActive = path === step.path;
                const isPassed = steps.findIndex(s => s.path === path) > idx; 

                return (
                    <Link
                        key={step.path}
                        to={step.path}
                        style={{ clipPath: getClipPath(idx) }}
                        className={`inline-flex items-center gap-1.5 h-7 transition-all shrink-0 ${
                            idx === 0 ? 'pl-3 pr-4' : 'pl-4.5 pr-4'
                        } ${
                            isActive
                                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                : isPassed
                                ? 'bg-emerald-600 text-white font-semibold hover:bg-emerald-700'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300 font-medium'
                        }`}
                    > 
                        <span className="truncate pl-3">{step.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
