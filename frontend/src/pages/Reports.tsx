import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';

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
    const [data, setData] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'project' | 'member'>('project');
    const [dateRange, setDateRange] = useState<string>('month');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

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
        setLoading(true);
        setRefreshing(true);
        try {
            const { startDate, endDate } = getDateRange();
            console.log('Fetching summary with dates:', startDate, endDate);
            const response = await fetch(
                `/api/reports/summary?startDate=${startDate}&endDate=${endDate}`,
                { credentials: 'include' }
            );
            if (response.ok) {
                const summary = await response.json();
                console.log('Summary data:', summary);
                setData(summary);
            } else {
                console.error('Failed to fetch summary:', response.status);
            }
        } catch (error) {
            console.error('Failed to fetch summary:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, refreshTrigger]);

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-64">
                    <div className="text-gray-600">Loading...</div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
                    <div className="flex items-center gap-3">
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            className="input-field"
                        >
                            <option value="week">Last 7 Days</option>
                            <option value="month">Last 30 Days</option>
                            <option value="quarter">Last 90 Days</option>
                        </select>
                        <button
                            onClick={() => setRefreshTrigger(prev => prev + 1)}
                            disabled={refreshing}
                            className="btn-primary flex items-center gap-2"
                            style={refreshing ? { cursor: 'wait' } : {}}
                        >
                            {refreshing && (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {refreshing ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="card p-6">
                        <div className="text-sm text-gray-500 mb-1">Total Hours</div>
                        <div className="text-3xl font-bold text-indigo-600">
                            {data?.summary.totalHours?.toFixed(1) || '0'}
                        </div>
                    </div>
                    <div className="card p-6">
                        <div className="text-sm text-gray-500 mb-1">Active Projects</div>
                        <div className="text-3xl font-bold text-green-600">
                            {data?.summary.activeProjects || 0}
                        </div>
                    </div>
                    <div className="card p-6">
                        <div className="text-sm text-gray-500 mb-1">Active Members</div>
                        <div className="text-3xl font-bold text-blue-600">
                            {data?.summary.activeMembers || 0}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex gap-8">
                        <button
                            onClick={() => setActiveTab('project')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'project'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            By Project
                        </button>
                        <button
                            onClick={() => setActiveTab('member')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'member'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            By Member
                        </button>
                    </nav>
                </div>

                {/* By Project Table */}
                {activeTab === 'project' && (
                    <div className="card overflow-hidden">
                        <table className="table-auto w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Project
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Total Hours
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Workers
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Entries
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {data?.byProject.map((project) => (
                                    <tr key={project.project_id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                            {project.project_name}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {project.total_hours.toFixed(1)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {project.member_count}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {project.transaction_count}
                                        </td>
                                    </tr>
                                ))}
                                {(!data?.byProject || data.byProject.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* By Member Table */}
                {activeTab === 'member' && (
                    <div className="card overflow-hidden">
                        <table className="table-auto w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Member
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Total Hours
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Projects
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Entries
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {data?.byMember.map((member) => (
                                    <tr key={member.member_id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm">
                                            <div className="font-medium text-gray-900">{member.member_name}</div>
                                            <div className="text-xs text-gray-500">{member.member_phone}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {member.total_hours.toFixed(1)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {member.project_count}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            {member.transaction_count}
                                        </td>
                                    </tr>
                                ))}
                                {(!data?.byMember || data.byMember.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No data for selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
}
