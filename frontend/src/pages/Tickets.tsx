import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { EditModal, EditField } from '../components/EditModal';
import { TicketDrawer, Bucket } from '../components/TicketDrawer';
import {
    SquareChevronLeft,
    SquareChevronRight,
    Search,
    RotateCw,
    PlusCircle,
    CheckSquare
} from 'lucide-react';

interface Project {
    id: number;
    name: string;
}

const formatTicketCode = (nodeName?: string, id?: number) => {
    if (!id) return '#-';
    const prefix = (nodeName ? nodeName.substring(0, 3).toUpperCase() : 'ACE');
    return `${prefix}-${10000 + id}`;
};

export function Tickets() {
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sortCombined, setSortCombined] = useState<string>('created_at:desc');
    const [search, setSearch] = useState('');
    const [changeFilter, setChangeFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTickets, setSelectedTickets] = useState<number[]>([]);
    const [creatingPacket, setCreatingPacket] = useState(false);
    const [selectedBucketId, setSelectedBucketId] = useState<number | null>(null);

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        setPage(1); // Reset to page 1 when filters change
    }, [statusFilter, projectFilter, sortCombined, search, changeFilter]);

    useEffect(() => {
        fetchBuckets();
    }, [statusFilter, projectFilter, sortCombined, search, changeFilter, page]);

    const fetchProjects = async () => {
        try {
            const response = await fetch('/api/projects?limit=100', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                if (data.projects) {
                    setProjects(data.projects);
                }
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        }
    };

    const fetchBuckets = async () => {
        setRefreshing(true);
        try {
            const [sortBy, sortOrder] = sortCombined.split(':');
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (projectFilter !== 'all') params.append('projectId', projectFilter);
            if (changeFilter !== 'all') params.append('potentialChange', changeFilter);
            params.append('sortBy', sortBy || 'created_at');
            params.append('order', sortOrder || 'desc');
            params.append('page', page.toString());
            params.append('limit', '12');
            if (search.trim()) params.append('search', search.trim());

            const response = await fetch(`/api/worklog?${params.toString()}`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.buckets && Array.isArray(data.buckets)) {
                    setBuckets(data.buckets);
                    setTotalPages(data.totalPages || 1);
                    setTotal(data.total || 0);
                    // Select first bucket if none selected and on desktop
                    if (data.buckets.length > 0 && selectedBucketId === null && window.innerWidth >= 1024) {
                        setSelectedBucketId(data.buckets[0].id);
                    }
                }
            } else {
                console.error('Failed to fetch worklog:', response.status);
                setBuckets([]);
            }
        } catch (error) {
            console.error('Failed to fetch worklog:', error);
            setBuckets([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleEdit = (bucket: Bucket) => {
        setEditingBucket(bucket);
    };

    const handleSave = async (values: Record<string, any>) => {
        if (!editingBucket) return;

        const response = await fetch(`/api/worklog/${editingBucket.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                projectId: values.projectId ? Number(values.projectId) : null,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to update');
        }

        await fetchBuckets();
    };

    const handleSubmit = async (id: number) => {
        if (!confirm('Are you sure you want to submit this ticket? This will create a transaction.')) return;
        try {
            const response = await fetch(`/api/worklog/${id}/approve`, {
                method: 'POST',
                credentials: 'include'
            });
            if (response.ok) {
                fetchBuckets();
            } else {
                console.error('Failed to submit ticket');
                alert('Failed to submit ticket');
            }
        } catch (error) {
            console.error('Error submitting ticket:', error);
            alert('Error submitting ticket');
        }
    };

    const handleReject = async (id: number) => {
        if (!confirm('Are you sure you want to reject this ticket?')) return;
        try {
            const response = await fetch(`/api/worklog/${id}/reject`, {
                method: 'POST',
                credentials: 'include'
            });
            if (response.ok) {
                fetchBuckets();
            } else {
                console.error('Failed to reject ticket');
                alert('Failed to reject ticket');
            }
        } catch (error) {
            console.error('Error rejecting ticket:', error);
            alert('Error rejecting ticket');
        }
    };

    const handleTogglePotentialChange = async (id: number, currentValue: boolean | null) => {
        try {
            const response = await fetch(`/api/worklog/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    potential_change: !currentValue,
                }),
            });
            if (response.ok) {
                setBuckets(prev => prev.map(b =>
                    b.id === id ? { ...b, potential_change: !currentValue } : b
                ));
            } else {
                console.error('Failed to toggle potential change');
            }
        } catch (error) {
            console.error('Error toggling potential change:', error);
        }
    };

    const handleUpdateHours = async (id: number, hours: number | null) => {
        try {
            const response = await fetch(`/api/worklog/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ hours }),
            });
            if (response.ok) {
                setBuckets(prev => prev.map(b =>
                    b.id === id ? { ...b, hours } : b
                ));
            } else {
                console.error('Failed to update hours');
            }
        } catch (error) {
            console.error('Error updating hours:', error);
        }
    };

    const getEditFields = (): EditField[] => {
        if (!editingBucket) return [];

        return [
            {
                name: 'projectId',
                label: 'Project',
                type: 'select',
                value: editingBucket.project_id,
                options: projects.map(p => ({ value: p.id, label: p.name })),
            },
        ];
    };

    const handleCreatePacket = async () => {
        if (!selectedTickets.length) return;
        setCreatingPacket(true);
        const title = prompt('Enter a title for the CO Packet:', `CO Packet - ${new Date().toLocaleDateString()}`);
        if (!title) {
            setCreatingPacket(false);
            return;
        }

        try {
            const res = await fetch('/api/copackets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    bucketIds: selectedTickets
                })
            });
            if (res.ok) {
                const data = await res.json();
                try {
                    await fetch(`/api/copackets/${data.packet.id}/generate`, { method: 'POST' });
                } catch (e) {
                    console.error('PDF gen failed');
                }
                alert(`Packet created successfully.`);
                setSelectionMode(false);
                setSelectedTickets([]);
                fetchBuckets();
            } else {
                alert('Failed to create CO Packet');
            }
        } catch (e) {
            alert('Error creating CO Packet');
        } finally {
            setCreatingPacket(false);
        }
    };

    const getStatusColors = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'open':
                return 'bg-sky-500 text-white font-bold border-sky-600 shadow-2xs';
            case 'submitted':
                return 'bg-emerald-600 text-white font-bold border-emerald-700 shadow-2xs';
            case 'pending_review':
                return 'bg-amber-500 text-white font-bold border-amber-600 shadow-2xs';
            case 'rejected':
                return 'bg-rose-600 text-white font-bold border-rose-700 shadow-2xs';
            default:
                return 'bg-slate-700 text-white font-bold border-slate-800 shadow-2xs';
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const selectedBucket = buckets.find(b => b.id === selectedBucketId) || null;

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-64">
                    <div className="text-gray-600 font-medium flex items-center gap-2">
                        <RotateCw className="w-5 h-5 animate-spin text-sky-600" />
                        Loading work entries...
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                
                {/* 1. Page Header & Actions */}
                <div className="flex-shrink-0 mb-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Daily Work Logs</h1>
                            <p className="text-xs text-slate-500">Capture, verify, and classify inbound field tickets</p>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            {selectionMode ? (
                                <>
                                    <button 
                                        className="btn-secondary btn-sm" 
                                        onClick={() => { setSelectionMode(false); setSelectedTickets([]); }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        className="btn-primary btn-sm" 
                                        disabled={selectedTickets.length === 0 || creatingPacket} 
                                        onClick={handleCreatePacket}
                                    >
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        {creatingPacket ? 'Creating...' : `Create CO Packet (${selectedTickets.length})`}
                                    </button>
                                </>
                            ) : (
                                <button 
                                    className="btn-secondary btn-sm" 
                                    onClick={() => setSelectionMode(true)}
                                >
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    Select for CO Packet
                                </button>
                            )}

                            <button
                                onClick={fetchBuckets}
                                disabled={refreshing}
                                className="btn-primary btn-sm"
                                style={refreshing ? { cursor: 'wait' } : {}}
                                title="Refresh work logs"
                            >
                                <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                                <span>{refreshing ? 'Loading...' : 'Refresh'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Compact Single-Row Search and Filter Bar */}
                <div className="bg-white rounded-lg p-1.5 px-3 mb-2 flex-shrink-0 shadow-xs border border-slate-200">
                    <div className="flex items-center gap-2 w-full">
                        {/* Search field */}
                        <div className="relative flex-1 min-w-0">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search worker, project, notes..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full h-8 pl-8 pr-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-400"
                            />
                        </div>

                        {/* Dropdown Filters (Single flex row with explicit compact widths) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            {/* Status Filter */}
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-slate-700 font-medium cursor-pointer w-28 shrink-0"
                            >
                                <option value="all">All Statuses</option>
                                <option value="open">Open</option>
                                <option value="pending_review">Pending Review</option>
                                <option value="submitted">Submitted</option>
                                <option value="rejected">Rejected</option>
                            </select>

                            {/* Project Filter */}
                            <select
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-slate-700 font-medium cursor-pointer w-32 shrink-0 truncate"
                            >
                                <option value="all">All Projects</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>

                            {/* Combined Sort Dropdown */}
                            <select
                                value={sortCombined}
                                onChange={(e) => setSortCombined(e.target.value)}
                                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-slate-700 font-medium cursor-pointer w-36 shrink-0"
                            >
                                <option value="created_at:desc">Sort: Newest First</option>
                                <option value="created_at:asc">Sort: Oldest First</option>
                                <option value="updated_at:desc">Sort: Recently Updated</option>
                                <option value="hours:desc">Sort: Highest Hours</option>
                            </select>

                            {/* Potential Change Flag Filter */}
                            <select
                                value={changeFilter}
                                onChange={(e) => setChangeFilter(e.target.value)}
                                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none text-slate-700 font-medium cursor-pointer w-28 shrink-0"
                            >
                                <option value="all">All Flags</option>
                                <option value="true">⚠️ Flagged CO</option>
                                <option value="false">✓ Verified</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 3. Main Body: Compact Table + Slide-over Drawer */}
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2.5 items-stretch overflow-hidden">
                    
                    {/* Left Pane: Compact Table */}
                    <div className="flex-1 min-h-0 flex flex-col card overflow-hidden border-slate-200 bg-white shadow-xs">
                        <div className="flex-1 min-h-0 overflow-auto">
                            <table className="w-full text-left border-collapse min-w-[620px]">
                                <thead className="bg-slate-50/95 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                                    <tr>
                                        {selectionMode && <th className="p-3 w-9 text-center"></th>}
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-20">ID</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-32">Worker</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-28">Date</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-40">Project</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Summary / Raw Task</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-20 text-center">Hours</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-14 text-center">Flag</th>
                                        <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-28 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {buckets.map((bucket) => {
                                        const isSelected = selectedBucketId === bucket.id;
                                        const dateStr = formatDate(bucket.created_at);

                                        return (
                                            <tr
                                                key={bucket.id}
                                                onClick={() => setSelectedBucketId(bucket.id)}
                                                className={`hover:bg-sky-50/40 cursor-pointer transition-colors ${
                                                    isSelected ? 'bg-sky-50/90 hover:bg-sky-50 border-l-4 border-l-sky-600 shadow-xs' : ''
                                                }`}
                                            >
                                                {selectionMode && (
                                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTickets.includes(bucket.id)}
                                                            onChange={() => setSelectedTickets(prev => 
                                                                prev.includes(bucket.id) 
                                                                    ? prev.filter(id => id !== bucket.id) 
                                                                    : [...prev, bucket.id]
                                                            )}
                                                            className="w-4 h-4 text-sky-600 rounded border-gray-300 focus:ring-sky-500 cursor-pointer"
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3 font-mono text-xs font-bold text-sky-700 whitespace-nowrap">
                                                    {formatTicketCode(bucket.node_name, bucket.id)}
                                                </td>
                                                <td className="p-3 text-slate-900 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="bg-slate-200/90 rounded-full w-6 h-6 flex items-center justify-center text-[11px] font-bold text-slate-800 flex-shrink-0 shadow-2xs">
                                                            {bucket.member_name ? 
                                                                bucket.member_name.split(' ').map(n => n[0]).join('').toUpperCase() :
                                                                'U'
                                                            }
                                                        </span>
                                                        <span className="truncate max-w-[110px] text-sm font-semibold text-slate-900">
                                                            {bucket.member_name || 'Unknown'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-600 whitespace-nowrap text-xs font-medium">
                                                    {dateStr}
                                                </td>
                                                <td className="p-3 text-slate-800 text-sm font-semibold truncate max-w-[160px]">
                                                    {bucket.project_name || 'No Project'}
                                                </td>
                                                <td className="p-3 text-slate-900 text-sm font-medium leading-snug max-w-[340px]">
                                                    <span className="line-clamp-2" title={bucket.summary || bucket.raw_text || ''}>
                                                        {bucket.summary || bucket.raw_text || '-'}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-extrabold text-slate-950 text-sm text-center whitespace-nowrap">
                                                    {bucket.hours !== null ? `${bucket.hours} h` : '-'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {bucket.potential_change ? (
                                                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300" title="Flagged Potential Change">⚠️ CO</span>
                                                    ) : (
                                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-extrabold" title="Verified">✓</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center whitespace-nowrap">
                                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide border shadow-2xs ${getStatusColors(bucket.status)}`}>
                                                        {bucket.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {buckets.length === 0 && (
                            <div className="p-8 text-center text-slate-500">
                                <p className="text-sm font-medium">No work entries found.</p>
                                <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search query.</p>
                            </div>
                        )}

                        {/* Compact Pagination Bar */}
                        {totalPages > 1 && (
                            <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50/80 px-3 py-2 flex justify-between items-center z-10 text-xs">
                                <span className="text-slate-500 text-[11px]">
                                    Showing {buckets.length} of {total} entries
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="btn-secondary btn-xs"
                                    >
                                        <SquareChevronLeft className="w-3.5 h-3.5" />
                                        Prev
                                    </button>
                                    <span className="px-2 py-1 text-xs font-semibold text-slate-700">
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="btn-secondary btn-xs"
                                    >
                                        Next
                                        <SquareChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Pane: Option A Slide-Over Drawer */}
                    {selectedBucket && (
                        <TicketDrawer
                            bucket={selectedBucket}
                            isOpen={true}
                            onClose={() => setSelectedBucketId(null)}
                            onEdit={() => handleEdit(selectedBucket)}
                            onSubmit={() => handleSubmit(selectedBucket.id)}
                            onReject={() => handleReject(selectedBucket.id)}
                            onToggleChange={() => handleTogglePotentialChange(selectedBucket.id, selectedBucket.potential_change)}
                            onUpdateHours={(hours) => handleUpdateHours(selectedBucket.id, hours)}
                        />
                    )}
                </div>
            </div>

            <EditModal
                isOpen={!!editingBucket}
                title={`Edit Ticket #${editingBucket?.id}`}
                fields={getEditFields()}
                onSave={handleSave}
                onClose={() => setEditingBucket(null)}
            />
        </Layout>
    );
}
