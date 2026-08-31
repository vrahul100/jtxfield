import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ProjectProgressReportView } from '../components/ProjectProgressReportView';
import { 
    FileText, 
    FolderKanban, 
    Users, 
    ChevronRight,
    RotateCw
} from 'lucide-react';

interface ProjectSummary {
    project_id: number;
    project_name: string;
    total_hours: number;
    member_count: number;
    transaction_count: number;
}

interface MemberSummary {
    member_id: number;
    member_name: string;
    member_phone: string;
    total_hours: number;
    project_count: number;
    transaction_count: number;
}

interface SummaryData {
    summary: {
        totalHours: number;
        activeProjects: number;
        activeMembers: number;
    };
    byProject: ProjectSummary[];
    byMember: MemberSummary[];
}

export function Reports() {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlTab = searchParams.get('tab');
    const urlProjectId = searchParams.get('projectId');

    const [activeTab, setActiveTab] = useState<'project-report' | 'project' | 'member'>(() => {
        if (urlTab === 'project' || urlTab === 'member' || urlTab === 'project-report') {
            return urlTab;
        }
        return 'project-report';
    });

    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
        return urlProjectId ? Number(urlProjectId) : null;
    });

    const [data, setData] = useState<SummaryData | null>(null);
    const [dateRange, setDateRange] = useState<string>('month');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    // Sync tab and projectId with URL params
    useEffect(() => {
        if (urlTab && (urlTab === 'project-report' || urlTab === 'project' || urlTab === 'member')) {
            setActiveTab(urlTab);
        }
        if (urlProjectId) {
            setSelectedProjectId(Number(urlProjectId));
        }
    }, [urlTab, urlProjectId]);

    const handleTabChange = (tab: 'project-report' | 'project' | 'member') => {
        setActiveTab(tab);
        const params: Record<string, string> = { tab };
        if (selectedProjectId) {
            params.projectId = selectedProjectId.toString();
        }
        setSearchParams(params);
    };

    const handleSelectProject = (projectId: number) => {
        setSelectedProjectId(projectId);
        setSearchParams({ tab: 'project-report', projectId: projectId.toString() });
    };

    const handleViewProjectProgress = (projectId: number) => {
        setSelectedProjectId(projectId);
        setActiveTab('project-report');
        setSearchParams({ tab: 'project-report', projectId: projectId.toString() });
    };

    const getDateRange = () => {
        const now = new Date();
        let startDate = new Date();

        switch (dateRange) {
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(now.getMonth() - 3);
                break;
            default:
                startDate.setMonth(now.getMonth() - 1);
        }

        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0],
        };
    };

    const fetchSummary = async () => {
        setRefreshing(true);
        try {
            const { startDate, endDate } = getDateRange();
            const response = await fetch(
                `/api/reports/summary?startDate=${startDate}&endDate=${endDate}`,
                { credentials: 'include' }
            );
            if (response.ok) {
                const summary = await response.json();
                setData(summary);
            } else {
                console.error('Failed to fetch summary:', response.status);
            }
        } catch (error) {
            console.error('Failed to fetch summary:', error);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, refreshTrigger]);

    return (
        <Layout>
            <div className="relative space-y-6 max-w-7xl w-full mx-auto pb-16 px-2 sm:px-4">
                
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4 pt-1">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
                            Reports & Analytics
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Executive project progress summaries, labor rollups, and crew activity reporting.
                        </p>
                    </div>

                    {activeTab !== 'project-report' && (
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-400 cursor-pointer shadow-2xs"
                            >
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                                <option value="quarter">Last 90 Days</option>
                            </select>
                            <button
                                onClick={() => setRefreshTrigger(prev => prev + 1)}
                                disabled={refreshing}
                                className="btn-primary btn-sm shadow-2xs"
                            >
                                <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Primary Navigation Tabs */}
                <div className="border-b border-slate-200">
                    <nav className="-mb-px flex gap-2 sm:gap-6 overflow-x-auto">
                        <button
                            onClick={() => handleTabChange('project-report')}
                            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                                activeTab === 'project-report'
                                    ? 'tab-nav-active'
                                    : 'tab-nav-inactive'
                            }`}
                        >
                            <FileText className="w-4 h-4" />
                            <span>Project Progress Report</span>
                        </button>
                        <button
                            onClick={() => handleTabChange('project')}
                            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                                activeTab === 'project'
                                    ? 'tab-nav-active'
                                    : 'tab-nav-inactive'
                            }`}
                        >
                            <FolderKanban className="w-4 h-4" />
                            <span>Overview by Project</span>
                        </button>
                        <button
                            onClick={() => handleTabChange('member')}
                            className={`py-3 px-3 border-b-2 text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                                activeTab === 'member'
                                    ? 'tab-nav-active'
                                    : 'tab-nav-inactive'
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            <span>Overview by Member</span>
                        </button>
                    </nav>
                </div>

                {/* TAB 1: Project Progress Report */}
                {activeTab === 'project-report' && (
                    <ProjectProgressReportView 
                        initialProjectId={selectedProjectId}
                        onProjectChange={handleSelectProject}
                    />
                )}

                {/* TAB 2: Overview by Project */}
                {activeTab === 'project' && (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Rollup Hours</div>
                                <div className="text-2xl sm:text-3xl font-black text-sky-600">
                                    {data?.summary.totalHours?.toFixed(1) || '0'} <span className="text-xs font-normal text-slate-400">hrs</span>
                                </div>
                            </div>
                            <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Projects</div>
                                <div className="text-2xl sm:text-3xl font-black text-emerald-600">
                                    {data?.summary.activeProjects || 0}
                                </div>
                            </div>
                            <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Crew Members</div>
                                <div className="text-2xl sm:text-3xl font-black text-blue-600">
                                    {data?.summary.activeMembers || 0}
                                </div>
                            </div>
                        </div>

                        {/* Projects Table */}
                        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-700">Project Hours & Worker Distribution</span>
                                <span className="text-xs text-slate-500 font-medium">{data?.byProject.length || 0} projects listed</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="table-auto w-full text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-3.5">Project</th>
                                            <th className="px-6 py-3.5">Total Hours</th>
                                            <th className="px-6 py-3.5">Workers</th>
                                            <th className="px-6 py-3.5">Entries</th>
                                            <th className="px-6 py-3.5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {data?.byProject.map((project) => (
                                            <tr key={project.project_id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-950">
                                                    {project.project_name}
                                                </td>
                                                <td className="px-6 py-4 text-slate-900 font-semibold">
                                                    {project.total_hours.toFixed(1)} hrs
                                                </td>
                                                <td className="px-6 py-4 text-slate-700">
                                                    {project.member_count}
                                                </td>
                                                <td className="px-6 py-4 text-slate-700">
                                                    {project.transaction_count}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleViewProjectProgress(project.project_id)}
                                                        className="btn-soft-primary"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        <span>View Progress Report</span>
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!data?.byProject || data.byProject.length === 0) && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                                    No project activity recorded for the selected date range.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: Overview by Member */}
                {activeTab === 'member' && (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Rollup Hours</div>
                                <div className="text-2xl sm:text-3xl font-black text-sky-600">
                                    {data?.summary.totalHours?.toFixed(1) || '0'} <span className="text-xs font-normal text-slate-400">hrs</span>
                                </div>
                            </div>
                            <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Projects</div>
                                <div className="text-2xl sm:text-3xl font-black text-emerald-600">
                                    {data?.summary.activeProjects || 0}
                                </div>
                            </div>
                            <div className="card p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Active Crew Members</div>
                                <div className="text-2xl sm:text-3xl font-black text-blue-600">
                                    {data?.summary.activeMembers || 0}
                                </div>
                            </div>
                        </div>

                        {/* Member Table */}
                        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-700">Member Work Allocation</span>
                                <span className="text-xs text-slate-500 font-medium">{data?.byMember.length || 0} crew members listed</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="table-auto w-full text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-3.5">Member</th>
                                            <th className="px-6 py-3.5">Total Hours</th>
                                            <th className="px-6 py-3.5">Projects</th>
                                            <th className="px-6 py-3.5">Entries</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {data?.byMember.map((member) => (
                                            <tr key={member.member_id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-950">{member.member_name}</div>
                                                    <div className="text-xs text-slate-400">{member.member_phone}</div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-900 font-semibold">
                                                    {member.total_hours.toFixed(1)} hrs
                                                </td>
                                                <td className="px-6 py-4 text-slate-700">
                                                    {member.project_count}
                                                </td>
                                                <td className="px-6 py-4 text-slate-700">
                                                    {member.transaction_count}
                                                </td>
                                            </tr>
                                        ))}
                                        {(!data?.byMember || data.byMember.length === 0) && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                                    No member activity recorded for the selected date range.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </Layout>
    );
}
