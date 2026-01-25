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

    const [expandedBucketIds, setExpandedBucketIds] = useState<number[]>([]);
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
        }
    };

    const toggleExpand = (id: number) => {
        // Accordion behavior: only one card open at a time
        setExpandedBucketIds(prev => 
            prev.includes(id) ? [] : [id]
        );
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
                    <h1 className="text-3xl font-bold text-gray-900">Work Captured</h1>
                    <button onClick={fetchBuckets} className="btn-primary">
                        Refresh
                    </button>
                </div>
                {/* Search and Filters */}
                <div className="card p-4 mb-6">
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Search by member, project, or message..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input-field w-full"
                        />
                    </div>
                    <div className="flex gap-4 flex-wrap">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Status
                            </label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="input-field"
                            >
                                <option value="all">All</option>
                                <option value="open">Open</option>
                                <option value="pending_review">Pending Review</option>
                                <option value="submitted">Submitted</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Project
                            </label>
                            <select
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                                className="input-field"
                            >
                                <option value="all">All Projects</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Sort By
                            </label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="input-field"
                            >
                                <option value="created_at">Date Created</option>
                                <option value="updated_at">Date Updated</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Order
                            </label>
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                                className="input-field"
                            >
                                <option value="desc">Newest First</option>
                                <option value="asc">Oldest First</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                ⚠️ Change
                            </label>
                            <select
                                value={changeFilter}
                                onChange={(e) => setChangeFilter(e.target.value)}
                                className="input-field"
                            >
                                <option value="all">All</option>
                                <option value="true">Flagged</option>
                                <option value="false">Not Flagged</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {buckets.map((bucket) => (
                        <WorkEntryCard
                            key={bucket.id}
                            bucket={bucket}
                            isExpanded={expandedBucketIds.includes(bucket.id)}
                            onToggleExpand={() => toggleExpand(bucket.id)}
                            onEdit={() => handleEdit(bucket)}
                            onSubmit={() => handleSubmit(bucket.id)}
                            onReject={() => handleReject(bucket.id)}
                            onToggleChange={() => handleTogglePotentialChange(bucket.id, bucket.potential_change)}
                        />
                    ))}
                </div>

                {buckets.length === 0 && (
                    <div className="card p-8 text-center text-gray-500">
                        <p className="text-lg">No work entries found.</p>
                        <p className="text-sm mt-2">Try adjusting your filters or search query.</p>
                    </div>
                )}               

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-6">
                        <span className="text-xs text-gray-600">
                            Showing {buckets.length} of {total} work entries
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                <SquareChevronLeft className="w-6 h-6" strokeWidth={3} />
                                Previous
                            </button>
                            <span className="px-3 py-1 text-xs">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                Next
                                <SquareChevronRight className="w-6 h-6" strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                )}
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

