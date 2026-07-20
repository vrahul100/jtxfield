import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { EditModal, EditField } from '../components/EditModal';
import { WorkEntryCard } from '../components/WorkEntryCard';
 
import {
 
    SquareChevronLeft,
    SquareChevronRight, 
} from 'lucide-react';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    media?: string[];
    timestamp: string;
}

interface Bucket {
    id: number;
    member_id: number;
    member_name: string;
    member_phone: string;
    project_id: number;
    project_name: string;
    node_name: string;
    status: string;
    raw_text: string;
    summary: string | null;
    image_urls: string | null;
    audio_urls: string | null;
    transcripts: string | null;
    conversation_history: ConversationMessage[] | null;
    clarity_score: number | null;
    notes: string | null;
    potential_change: boolean | null;
    hours: number | null;
    created_at: string;
    updated_at?: string;
}

interface Project {
    id: number;
    name: string;
}

export function Tickets() {
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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
    }, [statusFilter, projectFilter, sortBy, sortOrder, search, changeFilter]);

    useEffect(() => {
        fetchBuckets();
    }, [statusFilter, projectFilter, sortBy, sortOrder, search, changeFilter, page]);

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
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (projectFilter !== 'all') params.append('projectId', projectFilter);
            if (changeFilter !== 'all') params.append('potentialChange', changeFilter);
            params.append('sortBy', sortBy);
            params.append('order', sortOrder);
            params.append('page', page.toString());
            params.append('limit', '10');
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
                // Update local state immediately for better UX
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
                // Update local state immediately for better UX
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
                } catch(e) {
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
        switch (status) {
            case 'open':
                return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'submitted':
                return 'bg-emerald-500 text-white border-emerald-500 font-bold';
            case 'pending_review':
                return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'rejected':
                return 'bg-red-200 text-red-900 border-red-300';
            default:
                return 'bg-slate-200 text-slate-800 border-slate-200';
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
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-shrink-0 pt-1 pb-2 mb-2">
                    <div className="flex justify-between items-center">
                        <h1 className="text-3xl font-bold text-gray-900">Work Captured</h1>
                        <div className="flex gap-2">
                            {selectionMode ? (
                                <>
                                    <button className="btn-secondary" onClick={() => { setSelectionMode(false); setSelectedTickets([]); }}>Cancel</button>
                                    <button className="btn-primary" disabled={selectedTickets.length === 0 || creatingPacket} onClick={handleCreatePacket}>
                                        {creatingPacket ? 'Creating...' : `Create CO Packet (${selectedTickets.length})`}
                                    </button>
                                </>
                            ) : (
                                <button className="btn-secondary" onClick={() => setSelectionMode(true)}>Select for CO Packet</button>
                            )}
                            <button
                                onClick={fetchBuckets}
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
                </div>

                {/* Search and Filters */}
                <div className="card p-2 px-3 mb-3 flex-shrink-0">
                    <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search by member, project, or message..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="input-field w-full py-1.5 px-3 text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 items-center w-full lg:w-auto">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="input-field w-full lg:!w-auto py-1 px-2 text-xs bg-slate-50 cursor-pointer font-medium border-slate-200"
                            >
                                <option value="all">All Statuses</option>
                                <option value="open">Open</option>
                                <option value="pending_review">Pending Review</option>
                                <option value="submitted">Submitted</option>
                                <option value="rejected">Rejected</option>
                            </select>

                            <select
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                                className="input-field w-full lg:!w-auto py-1 px-2 text-xs bg-slate-50 cursor-pointer font-medium border-slate-200 max-w-full lg:max-w-[160px] truncate"
                            >
                                <option value="all">All Projects</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>

                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="input-field w-full lg:!w-auto py-1 px-2 text-xs bg-slate-50 cursor-pointer font-medium border-slate-200"
                            >
                                <option value="created_at">Sort: Created Date</option>
                                <option value="updated_at">Sort: Updated Date</option>
                            </select>

                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                                className="input-field w-full lg:!w-auto py-1 px-2 text-xs bg-slate-50 cursor-pointer font-medium border-slate-200"
                            >
                                <option value="desc">Order: Newest First</option>
                                <option value="asc">Order: Oldest First</option>
                            </select>

                            <select
                                value={changeFilter}
                                onChange={(e) => setChangeFilter(e.target.value)}
                                className="input-field w-full lg:!w-auto py-1 px-2 text-xs bg-slate-50 cursor-pointer font-medium border-slate-200"
                            >
                                <option value="all">All Changes</option>
                                <option value="true">⚠️ Flagged</option>
                                <option value="false">✓ Not Flagged</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 items-stretch overflow-hidden">
                    {/* Left Panel: Table List */}
                    <div className={`transition-all duration-300 flex flex-col min-h-0 card overflow-hidden ${selectedBucketId ? 'w-full lg:w-7/12' : 'w-full'}`}>
                        {/* Scrollable Table Container */}
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                    <tr>
                                        {selectionMode && <th className="p-3 w-10 text-center"></th>}
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">ID</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Worker</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Date</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Summary</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20 text-center">Hours</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16 text-center">Flag</th>
                                        <th className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24 text-center">Status</th>
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
                                                className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                                                    isSelected ? 'bg-indigo-50/70 hover:bg-indigo-50/90' : ''
                                                }`}
                                            >
                                                {selectionMode && (
                                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTickets.includes(bucket.id)}
                                                            onChange={() => setSelectedTickets(prev => prev.includes(bucket.id) ? prev.filter(id => id !== bucket.id) : [...prev, bucket.id])}
                                                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3 font-mono text-xs font-bold text-indigo-600">
                                                    #{bucket.id}
                                                </td>
                                                <td className="p-3 text-sm text-slate-700 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="bg-slate-200 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                                                            {bucket.member_name ? 
                                                                bucket.member_name.split(' ').map(n => n[0]).join('').toUpperCase() :
                                                                'U'
                                                            }
                                                        </span>
                                                        <span className="truncate max-w-[80px] font-medium">
                                                            {bucket.member_name || 'Unknown'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                                                    {dateStr}
                                                </td>
                                                <td className="p-3 text-sm text-slate-700 font-medium truncate max-w-[120px]">
                                                    {bucket.project_name || 'No Project'}
                                                </td>
                                                <td className="p-3 text-xs text-slate-600 italic truncate max-w-[200px]">
                                                    {bucket.summary || bucket.raw_text || '-'}
                                                </td>
                                                <td className="p-3 text-sm font-semibold text-slate-900 text-center whitespace-nowrap">
                                                    {bucket.hours !== null ? `${bucket.hours} h` : '-'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {bucket.potential_change ? (
                                                        <span className="text-orange-600 text-base" title="Flagged Potential Change">⚠️</span>
                                                    ) : (
                                                        <span className="text-emerald-500 text-sm font-bold" title="Verified">✓</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase ${getStatusColors(bucket.status)}`}>
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
                            <div className="p-8 text-center text-gray-500">
                                <p className="text-lg">No work entries found.</p>
                                <p className="text-sm mt-2">Try adjusting your filters or search query.</p>
                            </div>
                        )}

                        {/* Pagination Bar - Fixed at bottom of table card */}
                        {totalPages > 1 && (
                            <div className="flex-shrink-0 border-t border-slate-200 bg-white p-2.5 px-4 flex justify-between items-center z-10">
                                <span className="text-xs text-gray-600">
                                    Showing {buckets.length} of {total} work entries
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-2.5 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-xs"
                                    >
                                        <SquareChevronLeft className="w-4 h-4" strokeWidth={3} />
                                        Previous
                                    </button>
                                    <span className="px-2.5 py-1 text-xs font-medium">
                                        Page {page} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="px-2.5 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-xs"
                                    >
                                        Next
                                        <SquareChevronRight className="w-4 h-4" strokeWidth={3} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Detail Drawer */}
                    {selectedBucketId && (
                        (() => {
                            const selectedBucket = buckets.find(b => b.id === selectedBucketId);
                            if (!selectedBucket) return null;

                            return (
                                <div className="w-full lg:w-5/12 min-h-0 flex flex-col border border-slate-200 bg-white rounded-xl shadow-lg overflow-hidden">
                                    <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-800 font-mono text-lg">Ticket #{selectedBucket.id}</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusColors(selectedBucket.status)}`}>
                                                {selectedBucket.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => setSelectedBucketId(null)} 
                                            className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none p-1"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                    <div className="p-4 overflow-y-auto flex-1 bg-slate-50/50">
                                        <WorkEntryCard
                                            bucket={selectedBucket}
                                            isExpanded={true}
                                            onToggleExpand={() => {}}
                                            onEdit={() => handleEdit(selectedBucket)}
                                            onSubmit={() => handleSubmit(selectedBucket.id)}
                                            onReject={() => handleReject(selectedBucket.id)}
                                            onToggleChange={() => handleTogglePotentialChange(selectedBucket.id, selectedBucket.potential_change)}
                                            onUpdateHours={(hours) => handleUpdateHours(selectedBucket.id, hours)}
                                            selectable={false}
                                        />
                                    </div>
                                </div>
                            );
                        })()
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

