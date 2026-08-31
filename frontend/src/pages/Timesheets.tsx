import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Calendar, ChevronDown, ChevronRight, Lock, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Timesheets() {
    const [timesheets, setTimesheets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [details, setDetails] = useState<Record<string, any[]>>({});
    const navigate = useNavigate();

    useEffect(() => {
        fetchTimesheets();
    }, []);

    const fetchTimesheets = async () => {
        try {
            const res = await fetch('/api/timesheets');
            if (res.ok) {
                const data = await res.json();
                setTimesheets(data.timesheets);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = async (id: string, memberId: number, weekStart: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
            setExpandedRows(newExpanded);
        } else {
            newExpanded.add(id);
            setExpandedRows(newExpanded);
            
            if (!details[id]) {
                try {
                    const res = await fetch(`/api/timesheets/${memberId}/details?weekStart=${encodeURIComponent(weekStart)}`);
                    if (res.ok) {
                        const data = await res.json();
                        setDetails(prev => ({ ...prev, [id]: data.tickets }));
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
    };

    const handleApprove = async (ts: any, id: string) => {
        if (!confirm(`Are you sure you want to lock this week for ${ts.member_name}?`)) return;
        
        try {
            const res = await fetch('/api/timesheets/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberId: ts.member_id,
                    weekStart: ts.week_start,
                    totalHours: ts.total_hours,
                    billableHours: ts.billable_hours,
                    nonScopeHours: ts.non_scope_hours
                })
            });
            if (res.ok) {
                setTimesheets(prev => prev.map(t => {
                    if (`${t.member_id}-${t.week_start}` === id) {
                        return { ...t, status: 'approved' };
                    }
                    return t;
                }));
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to approve');
            }
        } catch (e) {
            console.error(e);
            alert('Failed to approve');
        }
    };

    const handleExportCSV = () => {
        window.location.href = '/api/timesheets/export/csv';
    };

    const renderDailyBreakdown = (tickets: any[]) => {
        if (!tickets || tickets.length === 0) return <p className="text-gray-500">No tickets found.</p>;
        
        // Group by day of week
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const grouped: Record<string, any[]> = {};
        
        tickets.forEach(t => {
            const dayName = days[new Date(t.created_at).getDay()];
            if (!grouped[dayName]) grouped[dayName] = [];
            grouped[dayName].push(t);
        });

        return (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {days.map(day => (
                    <div key={day} className="bg-white p-3 rounded-md shadow-sm border border-gray-100 min-h-[100px]">
                        <h5 className="font-semibold text-xs text-gray-500 uppercase mb-2 border-b pb-1">{day}</h5>
                        {grouped[day] ? (
                            <div className="space-y-2">
                                {grouped[day].map(t => (
                                    <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="text-xs bg-gray-50 p-2 rounded border border-gray-200 cursor-pointer hover:bg-sky-50 hover:border-sky-200 transition-colors">
                                        <div className="flex justify-between font-bold mb-1">
                                            <span className="text-sky-600">#{t.id}</span>
                                            <span>{t.hours}h</span>
                                        </div>
                                        <div className="text-gray-500 truncate">{t.project_name || 'Unassigned'}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-400 text-center mt-4">-</div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Layout>
            <div className="relative">
                <div className="sticky top-0 z-10 bg-slate-100 pt-2 pb-2 mb-4">
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                                <Calendar className="w-8 h-8 text-sky-600" />
                                Timesheets
                            </h1>
                            <p className="text-gray-500 mt-2">Aggregate verified buckets into payroll-ready weekly timesheets.</p>
                        </div>
                        <button onClick={handleExportCSV} className="btn-secondary btn-md">
                            <Download className="w-4 h-4" /> Export Approved (CSV)
                        </button>
                    </div>
                </div>

            <div className="card overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="p-4 font-semibold text-gray-600 w-8"></th>
                            <th className="p-4 font-semibold text-gray-600">Worker</th>
                            <th className="p-4 font-semibold text-gray-600">Week Start</th>
                            <th className="p-4 font-semibold text-gray-600">Tickets</th>
                            <th className="p-4 font-semibold text-gray-600">Total Hours</th>
                            <th className="p-4 font-semibold text-gray-600">Billable</th>
                            <th className="p-4 font-semibold text-gray-600">Status</th>
                            <th className="p-4 font-semibold text-gray-600 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={8} className="p-8 text-center text-gray-500">Loading timesheets...</td></tr>
                        ) : timesheets.length === 0 ? (
                            <tr><td colSpan={8} className="p-8 text-center text-gray-500">No timesheets available.</td></tr>
                        ) : timesheets.map((ts, i) => {
                            const rowId = `${ts.member_id}-${ts.week_start}`;
                            const isExpanded = expandedRows.has(rowId);
                            const isApproved = ts.status === 'approved';
                            
                            return (
                                <React.Fragment key={i}>
                                    <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-sky-50/30' : ''}`} onClick={() => toggleRow(rowId, ts.member_id, ts.week_start)}>
                                        <td className="p-4">
                                            {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                                        </td>
                                        <td className="p-4 font-medium text-gray-900">{ts.member_name}</td>
                                        <td className="p-4 text-gray-600">{new Date(ts.week_start).toLocaleDateString()}</td>
                                        <td className="p-4 text-gray-600">{ts.ticket_count}</td>
                                        <td className="p-4 font-mono font-bold text-gray-900">{parseFloat(ts.total_hours).toFixed(2)}h</td>
                                        <td className="p-4 font-mono text-green-700">{parseFloat(ts.billable_hours).toFixed(2)}h</td>
                                        <td className="p-4">
                                            {isApproved ? (
                                                <span className="badge-indigo">
                                                    <Lock className="w-3 h-3" /> Locked
                                                </span>
                                            ) : (
                                                <span className="badge-neutral">
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            {!isApproved && (
                                                <button className="btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); handleApprove(ts, rowId); }}>
                                                    Approve Week
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={8} className="p-0 border-b border-gray-200 bg-gray-50">
                                                <div className="p-6">
                                                    <h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                                        Daily Breakdown
                                                    </h4>
                                                    {renderDailyBreakdown(details[rowId])}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            </div>
        </Layout>
    );
}
