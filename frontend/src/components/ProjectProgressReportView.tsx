import { useState, useEffect } from 'react';
import { 
    Calendar, 
    Clock, 
    DollarSign, 
    Users, 
    Camera, 
    AlertTriangle, 
    RotateCw, 
    Check, 
    Download, 
    Building2, 
    Share2,
    FolderKanban
} from 'lucide-react';

export interface ProjectSummaryStats {
    totalTickets: number;
    totalHours: number;
    totalLaborCost: number;
    activeWorkersCount: number;
    totalPhotosCount: number;
    flaggedCount: number;
    firstActivityAt?: string;
    latestActivityAt?: string;
}

export interface WorkerProgressReportItem {
    workerName: string;
    role: string;
    hours: number;
    cost: number;
    ticketCount: number;
    bullets?: string[];
    summary: string;
}

export interface PeriodProgressReport {
    period: string;
    overallSummary: string;
    overallBullets?: string[];
    workerReports: WorkerProgressReportItem[];
    totalHours: number;
    workersCount: number;
    totalCost: number;
}

interface ProjectOption {
    id: number;
    name: string;
    node_name?: string;
}

interface ProjectProgressReportViewProps {
    initialProjectId?: number | null;
    onProjectChange?: (projectId: number) => void;
}

export function ProjectProgressReportView({ 
    initialProjectId, 
    onProjectChange 
}: ProjectProgressReportViewProps) {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectId || null);
    const [loadingProjects, setLoadingProjects] = useState(true);

    const [projectName, setProjectName] = useState<string>('');
    const [nodeName, setNodeName] = useState<string>('');
    const [stats, setStats] = useState<ProjectSummaryStats | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');

    // GC-to-Customer Progress Report State
    const [report, setReport] = useState<PeriodProgressReport | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [copiedReport, setCopiedReport] = useState(false);

    // 1. Fetch available projects for dropdown
    useEffect(() => {
        fetchProjectsList();
    }, []);

    // Sync if initialProjectId changes externally
    useEffect(() => {
        if (initialProjectId && initialProjectId !== selectedProjectId) {
            setSelectedProjectId(initialProjectId);
        }
    }, [initialProjectId]);

    const fetchProjectsList = async () => {
        setLoadingProjects(true);
        try {
            const res = await fetch('/api/projects?limit=100', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const list: ProjectOption[] = data.projects || [];
                setProjects(list);
                if (!selectedProjectId && list.length > 0) {
                    const firstId = list[0].id;
                    setSelectedProjectId(firstId);
                    if (onProjectChange) onProjectChange(firstId);
                }
            }
        } catch (err) {
            console.error('Failed to fetch projects list:', err);
        } finally {
            setLoadingProjects(false);
        }
    };

    // 2. Fetch Project Summary & Period Report when selected project or dateFilter changes
    useEffect(() => {
        if (selectedProjectId) {
            fetchSummary(selectedProjectId);
            fetchPeriodReport(selectedProjectId);
        }
    }, [selectedProjectId, dateFilter]);

    const getDateRange = () => {
        const now = new Date();
        let startDate: string | undefined;
        let endDate: string | undefined;
        let timeframeLabel = 'Today';

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

    const fetchSummary = async (projectId: number) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/summary`, { credentials: 'include' });
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

    const fetchPeriodReport = async (projectId: number) => {
        setIsGeneratingReport(true);
        setRefreshing(true);
        try {
            const { startDate, endDate, timeframeLabel } = getDateRange();
            const res = await fetch(`/api/projects/${projectId}/daily-summary`, {
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

    const handleSelectProject = (projectId: number) => {
        setSelectedProjectId(projectId);
        if (onProjectChange) {
            onProjectChange(projectId);
        }
    };

    const handleCopyCustomerReport = () => {
        if (!report) return;

        const summaryText: string = report.overallSummary || (report as any).summary || 'No work recorded for this period.';
        const bullets = (report.overallBullets && report.overallBullets.length > 0)
            ? report.overallBullets.map(b => `• ${b}`).join('\n')
            : summaryText.split('\n').filter(Boolean).map((b: string) => `• ${b}`).join('\n');

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

    if (loadingProjects) {
        return (
            <div className="flex items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-medium">
                    <RotateCw className="w-5 h-5 animate-spin text-sky-600" />
                    <span>Loading projects...</span>
                </div>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="card p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                <FolderKanban className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-900">No Projects Found</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Create your first project under Projects to generate comprehensive progress reports.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Top Toolbar: Project Selector + Actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs print:hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap flex items-center gap-1.5">
                        <FolderKanban className="w-4 h-4 text-sky-600" />
                        Select Project:
                    </label>
                    <select
                        value={selectedProjectId || ''}
                        onChange={(e) => handleSelectProject(Number(e.target.value))}
                        className="w-full sm:w-72 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-400 focus:border-sky-500 cursor-pointer"
                    >
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} {p.node_name ? `(${p.node_name})` : ''}
                            </option>
                        ))}
                    </select>

                    {nodeName && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                            <Building2 className="w-3 h-3" />
                            {nodeName}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
                    <button
                        onClick={() => { 
                            if (selectedProjectId) {
                                fetchSummary(selectedProjectId); 
                                fetchPeriodReport(selectedProjectId); 
                            }
                        }}
                        disabled={refreshing || isGeneratingReport}
                        className="btn-secondary btn-sm"
                    >
                        <RotateCw className={`w-3.5 h-3.5 ${(refreshing || isGeneratingReport) ? 'animate-spin' : ''}`} />
                        <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </button>

                    <button
                        onClick={handleCopyCustomerReport}
                        disabled={!report}
                        className="btn-secondary btn-sm"
                        title="Copy customer progress report"
                    >
                        {copiedReport ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700 font-bold">Copied for Customer!</span>
                            </>
                        ) : (
                            <>
                                <Share2 className="w-3.5 h-3.5 text-sky-600" />
                                <span>Copy for Customer</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="btn-secondary btn-sm"
                        title="Print / Save as PDF"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Print / PDF</span>
                    </button>
                </div>
            </div>

            {/* Cumulative Project KPI Ribbon */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 print:grid-cols-5 print:gap-2 print:break-inside-avoid">
                    {/* Hours */}
                    <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs print:border-slate-300 print:p-2.5 print:shadow-none">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Cumulative Hours</span>
                            <Clock className="w-4 h-4 text-sky-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-950">{stats.totalHours.toFixed(1)} <span className="text-xs font-normal text-slate-500">hrs</span></div>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">{stats.totalTickets} total work entries</span>
                    </div>

                    {/* Labor Cost */}
                    <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs print:border-slate-300 print:p-2.5 print:shadow-none">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Labor Cost</span>
                            <DollarSign className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="text-2xl font-black text-emerald-950">${stats.totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">Via Rate Card billing</span>
                    </div>

                    {/* Crew Members */}
                    <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs print:border-slate-300 print:p-2.5 print:shadow-none">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total Active Crew</span>
                            <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-950">{stats.activeWorkersCount} <span className="text-xs font-normal text-slate-500">workers</span></div>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">Across all trades</span>
                    </div>

                    {/* Photos */}
                    <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs print:border-slate-300 print:p-2.5 print:shadow-none">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Site Evidence</span>
                            <Camera className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-950">{stats.totalPhotosCount} <span className="text-xs font-normal text-slate-500">photos</span></div>
                        <span className="text-[11px] text-slate-500 mt-0.5 block">Visual audit records</span>
                    </div>

                    {/* Scope Flags / CO */}
                    <div className="card p-4 bg-white border-2 border-slate-200 rounded-xl shadow-xs print:border-slate-300 print:p-2.5 print:shadow-none">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Flagged / COs</span>
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="text-2xl font-black text-amber-950">{stats.flaggedCount} <span className="text-xs font-normal text-slate-500">items</span></div>
                        <span className="text-[11px] text-amber-800 font-semibold mt-0.5 block">Potential Change Orders</span>
                    </div>
                </div>
            )}

            {/* Timeframe Filter Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs print:hidden">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Timeframe:
                    </span>
                    {(['today', 'yesterday', 'week', 'month'] as const).map((preset) => (
                        <button
                            key={preset}
                            onClick={() => setDateFilter(preset)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize cursor-pointer ${
                                dateFilter === preset
                                    ? 'bg-sky-500 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            {preset === 'week' ? 'Past 7 Days' : preset === 'month' ? 'Past 30 Days' : preset}
                        </button>
                    ))}
                </div>
            </div>

            {/* Print-Only Document Cover Header */}
            <div className="hidden print:flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-2">
                <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="Jentyx" className="h-8 w-auto object-contain" />
                    <div>
                        <div className="text-base font-black text-slate-950 tracking-tight leading-tight">Jentyx Work</div>
                        <div className="text-xs text-slate-600 font-semibold">{nodeName ? `${nodeName} • ` : ''}Executive Progress Report</div>
                    </div>
                </div>
                <div className="text-right text-xs">
                    <div className="font-bold text-slate-900">Printed: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div className="text-[11px] text-slate-500 font-medium">Customer Progress Verification</div>
                </div>
            </div>

            {/* GC-TO-CUSTOMER PROGRESS REPORT */}
            <div className="card p-5 sm:p-7 bg-white border-2 border-sky-200 rounded-2xl shadow-md space-y-5 print:border-0 print:shadow-none print:p-0 print:space-y-4">
                
                {/* Header: From [Start] to [End] */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b-2 border-slate-100 pb-4 print:border-b print:border-slate-300 print:pb-2">
                    <div>
                        <span className="text-xs font-black uppercase tracking-wider text-sky-600 block mb-1">
                            {projectName ? `${projectName} — Progress Report` : 'Project Progress Report'}
                        </span>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-sky-600 print:hidden" />
                            From {report?.period || 'Selected Timeframe'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        {report && (
                            <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-right print:border-slate-300 print:bg-white">
                                <span className="text-[10px] font-bold text-slate-500 block leading-none">Total Hours</span>
                                <span className="text-sm font-black text-slate-900">{report.totalHours} hrs</span>
                            </div>
                        )}
                        <button
                            onClick={handleCopyCustomerReport}
                            disabled={!report}
                            className="btn-primary btn-sm print:hidden"
                        >
                            {copiedReport ? (
                                <>
                                    <Check className="w-4 h-4 text-white" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Share2 className="w-4 h-4 text-white" />
                                    <span>Copy for Customer</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                {isGeneratingReport ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-sky-600">
                        <RotateCw className="w-8 h-8 animate-spin" />
                        <span className="text-xs font-semibold">Synthesizing overall project and per-worker progress report...</span>
                    </div>
                ) : report ? (
                    <div className="space-y-6">
                        
                        {/* Full Summarization of What Work Was Done (Key Bullets) */}
                        <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 print:bg-white print:border-slate-300 print:break-inside-avoid print:p-3">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 block">
                                Overall Work Summarization (Key Highlights)
                            </span>
                            
                            {report.overallBullets && report.overallBullets.length > 0 ? (
                                <ul className="space-y-2">
                                    {report.overallBullets.map((bullet, idx) => (
                                        <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-900 leading-relaxed font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-2 flex-shrink-0" />
                                            <span>{bullet}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="space-y-2 text-sm text-slate-900 font-medium leading-relaxed">
                                    {(report.overallSummary || (report as any).summary || 'No work recorded for this timeframe.').split('\n').filter(Boolean).map((line: string, idx: number) => (
                                        <div key={idx} className="flex items-start gap-2.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-2 flex-shrink-0" />
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

                            {(!report.workerReports || report.workerReports.length === 0) ? (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                                    No individual worker logs recorded for this timeframe.
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {report.workerReports.map((w, idx) => (
                                        <div 
                                            key={idx} 
                                            className="p-4 bg-white border-2 border-slate-200 hover:border-sky-300 rounded-xl flex flex-col sm:flex-row justify-between items-start gap-3 transition-colors shadow-2xs print:border-slate-300 print:shadow-none print:break-inside-avoid print:p-3 print:mb-2"
                                        >
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-black text-slate-950">{w.workerName}</span>
                                                    <span className="badge-sky">
                                                        {w.role}
                                                    </span>
                                                    <span className="text-xs text-slate-400 font-medium">({w.ticketCount} tickets logged)</span>
                                                </div>
                                                
                                                {w.bullets && w.bullets.length > 0 ? (
                                                    <ul className="space-y-1.5 pl-1">
                                                        {w.bullets.map((b, bIdx) => (
                                                            <li key={bIdx} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed font-medium">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 flex-shrink-0" />
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
                            )}
                        </div>

                    </div>
                ) : (
                    <div className="py-8 text-center text-slate-400">
                        No work records found for this timeframe.
                    </div>
                )}

            </div>
        </div>
    );
}
