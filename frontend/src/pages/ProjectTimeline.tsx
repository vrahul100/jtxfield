import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { 
    Calendar, 
    Clock, 
    DollarSign, 
    Users, 
    Camera, 
    AlertTriangle, 
    ArrowLeft, 
    RotateCw, 
    Copy, 
    Check, 
    Download, 
    Building2, 
    Briefcase, 
    Share2 
} from 'lucide-react';

interface ProjectSummaryStats {
    totalTickets: number;
    totalHours: number;
    totalLaborCost: number;
    activeWorkersCount: number;
    totalPhotosCount: number;
    flaggedCount: number;
    firstActivityAt?: string;
    latestActivityAt?: string;
}

interface WorkerProgressReportItem {
    workerName: string;
    role: string;
    hours: number;
    cost: number;
    ticketCount: number;
    bullets?: string[];
    summary: string;
}

interface PeriodProgressReport {
    period: string;
    overallSummary: string;
    overallBullets?: string[];
    workerReports: WorkerProgressReportItem[];
    totalHours: number;
    workersCount: number;
    totalCost: number;
}

export function ProjectTimeline() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    useAuth();

    const [projectName, setProjectName] = useState<string>('Loading Project...');
    const [nodeName, setNodeName] = useState<string>('');
    const [stats, setStats] = useState<ProjectSummaryStats | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');

    // Unified GC-to-Customer Progress Report State
    const [report, setReport] = useState<PeriodProgressReport | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [copiedReport, setCopiedReport] = useState(false);

    useEffect(() => {
        if (id) {
            fetchSummary();
            fetchPeriodReport();
        }
    }, [id, dateFilter]);

    const getDateRange = () => {
        const now = new Date();
        let startDate: string | undefined;
        let endDate: string | undefined;
        let timeframeLabel = 'All Time';

        if (dateFilter === 'today') {
            const todayStr = now.toISOString().split('T')[0];
            startDate = todayStr;
            endDate = todayStr;
            timeframeLabel = 'Today';
        } else if (dateFilter === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(now.getDate() - 1);
            const yestStr = yest.toISOString().split('T')[0];
            startDate = yestStr;
            endDate = yestStr;
            timeframeLabel = 'Yesterday';
        } else if (dateFilter === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            startDate = weekAgo.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
            timeframeLabel = 'Past 7 Days';
        } else if (dateFilter === 'month') {
            const monthAgo = new Date(now);
            monthAgo.setDate(now.getDate() - 30);
            startDate = monthAgo.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
            timeframeLabel = 'Past 30 Days';
        }

        return { startDate, endDate, timeframeLabel };
    };

    const fetchSummary = async () => {
        try {
            const res = await fetch(`/api/projects/${id}/summary`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.project?.name) setProjectName(data.project.name);
                if (data.project?.node_name) setNodeName(data.project.node_name);
                setStats(data.stats);
            }
        } catch (err) {
            console.error('Failed to fetch project summary:', err);
        }
    };

    const fetchPeriodReport = async () => {
        setIsGeneratingReport(true);
        setRefreshing(true);
        try {
            const { startDate, endDate, timeframeLabel } = getDateRange();
            const res = await fetch(`/api/projects/${id}/daily-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ startDate, endDate, timeframeLabel })
            });

            if (res.ok) {
                const data = await res.json();
                setReport(data);
                if (data.projectName) setProjectName(data.projectName);
                if (data.nodeName) setNodeName(data.nodeName);
            }
        } catch (err) {
            console.error('Failed to generate project progress summary:', err);
        } finally {
            setIsGeneratingReport(false);
            setRefreshing(false);
        }
    };

    const handleCopyCustomerReport = () => {
        if (!report) return;

        const bullets = (report.overallBullets && report.overallBullets.length > 0)
            ? report.overallBullets.map(b => `• ${b}`).join('\n')
            : report.overallSummary.split('\n').filter(Boolean).map(b => `• ${b}`).join('\n');

        const workerLines = report.workerReports?.map(w => {
            const workerBullets = (w.bullets && w.bullets.length > 0)
                ? w.bullets.map(b => `  - ${b}`).join('\n')
                : `  - ${w.summary}`;
            return `• ${w.workerName} (${w.role}) : ${w.hours} hrs\n${workerBullets}`;
        }).join('\n\n') || '';

        const customerText = `From ${report.period}

Overall Work Summary:
${bullets}

Worker Progress Breakdown:
${workerLines}`;

        navigator.clipboard.writeText(customerText);
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 3000);
    };

    return (
        <Layout>
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6 max-w-7xl w-full mx-auto pb-16 px-2 sm:px-4">
                
                {/* 1. Top Navigation Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4 pt-1">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/projects')}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                            title="Back to Projects"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
                                    {projectName}
                                </h1>
                                {nodeName && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                        <Building2 className="w-3 h-3" />
                                        {nodeName}
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                    <Briefcase className="w-3 h-3" />
                                    Project Progress Report
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Executive progress report and worker activity summary for customer review.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                        <button
                            onClick={() => { fetchSummary(); fetchPeriodReport(); }}
                            disabled={refreshing || isGeneratingReport}
                            className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer"
                        >
                            <RotateCw className={`w-3.5 h-3.5 ${(refreshing || isGeneratingReport) ? 'animate-spin' : ''}`} />
                            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>

                        <button
                            onClick={handleCopyCustomerReport}
                            disabled={!report}
                            className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-xs cursor-pointer"
                            title="Copy customer progress report"
                        >
                            {copiedReport ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-700 font-bold">Copied for Customer!</span>
                                </>
                            ) : (
                                <>
                                    <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Copy for Customer</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => window.print()}
                            className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 shadow-xs cursor-pointer"
                            title="Print / Save as PDF"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Print / PDF</span>
                        </button>
                    </div>
                </div>

                {/* 2. Cumulative Project KPI Ribbon */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {/* Hours */}
                        <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Cumulative Hours</span>
                                <Clock className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="text-2xl font-black text-slate-950">{stats.totalHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span></div>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">{stats.totalTickets} total work entries</span>
                        </div>

                        {/* Labor Cost */}
                        <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Labor Cost</span>
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="text-2xl font-black text-emerald-950">${stats.totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">Via Rate Card billing</span>
                        </div>

                        {/* Crew Members */}
                        <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Active Crew</span>
                                <Users className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="text-2xl font-black text-slate-950">{stats.activeWorkersCount} <span className="text-xs font-normal text-slate-500">workers</span></div>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">Across all trades</span>
                        </div>

                        {/* Photos */}
                        <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Site Evidence</span>
                                <Camera className="w-4 h-4 text-purple-600" />
                            </div>
                            <div className="text-2xl font-black text-slate-950">{stats.totalPhotosCount} <span className="text-xs font-normal text-slate-500">photos</span></div>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">Visual audit records</span>
                        </div>

                        {/* Scope Flags / CO */}
                        <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Flagged / COs</span>
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                            </div>
                            <div className="text-2xl font-black text-amber-950">{stats.flaggedCount} <span className="text-xs font-normal text-slate-500">items</span></div>
                            <span className="text-[11px] text-amber-800 font-semibold mt-0.5 block">Potential Change Orders</span>
                        </div>
                    </div>
                )}

                {/* 3. Timeframe Filter Toolbar */}
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Timeframe:
                        </span>
                        {(['all', 'today', 'yesterday', 'week', 'month'] as const).map((preset) => (
                            <button
                                key={preset}
                                onClick={() => setDateFilter(preset)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize cursor-pointer ${
                                    dateFilter === preset
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                                {preset === 'all' ? 'All Time' : preset === 'week' ? 'Past 7 Days' : preset === 'month' ? 'Past 30 Days' : preset}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4. GC-TO-CUSTOMER PROGRESS REPORT */}
                <div className="card p-5 sm:p-7 bg-white border-2 border-indigo-300 rounded-2xl shadow-md space-y-5">
                    
                    {/* Header: From [Start] to [End] */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b-2 border-slate-100 pb-4">
                        <div>
                            <span className="text-xs font-black uppercase tracking-wider text-indigo-600 block mb-1">
                                Project Progress Report
                            </span>
                            <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-600" />
                                From {report?.period || 'Selected Timeframe'}
                            </h2>
                        </div>

                        <div className="flex items-center gap-2">
                            {report && (
                                <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-right">
                                    <span className="text-[10px] font-bold text-slate-500 block leading-none">Total Hours</span>
                                    <span className="text-sm font-black text-slate-900">{report.totalHours} hrs</span>
                                </div>
                            )}
                            <button
                                onClick={handleCopyCustomerReport}
                                disabled={!report}
                                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            >
                                {copiedReport ? (
                                    <>
                                        <Check className="w-3.5 h-3.5 text-white" />
                                        <span>Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3.5 h-3.5 text-white" />
                                        <span>Copy for Customer</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {isGeneratingReport ? (
                        <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                            <RotateCw className="w-6 h-6 animate-spin text-indigo-600" />
                            <span className="text-xs font-semibold">Synthesizing overall project and per-worker progress report...</span>
                        </div>
                    ) : report ? (
                        <div className="space-y-6">
                            
                            {/* Full Summarization of What Work Was Done (Key Bullets) */}
                            <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 block">
                                    Overall Work Summarization (Key Highlights)
                                </span>
                                
                                {report.overallBullets && report.overallBullets.length > 0 ? (
                                    <ul className="space-y-2">
                                        {report.overallBullets.map((bullet, idx) => (
                                            <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-900 leading-relaxed font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-2 flex-shrink-0" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="space-y-2 text-sm text-slate-900 font-medium leading-relaxed">
                                        {report.overallSummary.split('\n').filter(Boolean).map((line, idx) => (
                                            <div key={idx} className="flex items-start gap-2.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-2 flex-shrink-0" />
                                                <span>{line}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Worker-by-Worker Progress Report Rollup */}
                            <div className="space-y-3">
                                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 block">
                                    Worker Progress Breakdown ({report.workerReports?.length || 0} Crew Members)
                                </span>

                                <div className="space-y-2.5">
                                    {report.workerReports?.map((w, idx) => (
                                        <div 
                                            key={idx} 
                                            className="p-4 bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-xl flex flex-col sm:flex-row justify-between items-start gap-3 transition-colors shadow-2xs"
                                        >
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-black text-slate-950">{w.workerName}</span>
                                                    <span className="px-2 py-0.2 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                                        {w.role}
                                                    </span>
                                                    <span className="text-xs text-slate-400 font-medium">({w.ticketCount} tickets logged)</span>
                                                </div>
                                                
                                                {w.bullets && w.bullets.length > 0 ? (
                                                    <ul className="space-y-1.5 pl-1">
                                                        {w.bullets.map((b, bIdx) => (
                                                            <li key={bIdx} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed font-medium">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                                                                <span>{b}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-xs text-slate-700 leading-relaxed font-normal">
                                                        {w.summary}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0 sm:self-start">
                                                <div className="px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-right">
                                                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 block leading-none mb-0.5">Hours Worked</span>
                                                    <span className="text-sm font-black text-slate-950">{w.hours} hrs</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div className="py-8 text-center text-slate-400">
                            No work records found for this timeframe.
                        </div>
                    )}

                </div>

            </div>
        </Layout>
    );
}
