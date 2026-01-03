import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import {
    Pencil,
    Music,
    Paperclip,
    ChevronRight,
    ChevronDown
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
    image_urls: string | null;
    audio_urls: string | null;
    transcripts: string | null;
    conversation_history: ConversationMessage[] | null;
    clarity_score: number | null;
    notes: string | null;
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

    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [expandedBucketIds, setExpandedBucketIds] = useState<number[]>([]);
    const [editingBucketId, setEditingBucketId] = useState<number | null>(null);
    const [editText, setEditText] = useState<string>('');
    const [editingProjectBucketId, setEditingProjectBucketId] = useState<number | null>(null);
    const [editProjectId, setEditProjectId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        setPage(1); // Reset to page 1 when filters change
    }, [statusFilter, projectFilter, sortBy, sortOrder, search]);

    useEffect(() => {
        fetchBuckets();
    }, [statusFilter, projectFilter, sortBy, sortOrder, search, page]);

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
            params.append('sortBy', sortBy);
            params.append('order', sortOrder);
            params.append('page', page.toString());
            params.append('limit', '20');
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open':
                return 'bg-indigo-100 text-indigo-800';
            case 'submitted':
                return 'bg-green-100 text-green-800';
            case 'pending_review':
                return 'bg-orange-100 text-orange-800';
            case 'rejected':
                return 'bg-red-200 text-red-900';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString();
    };

    const getConfidenceColor = (score: number | null | undefined) => {
        if (score === null || score === undefined) return 'text-gray-400';
        if (score >= 0.7) return 'text-green-600';
        if (score >= 0.4) return 'text-yellow-600';
        return 'text-red-600';
    };

    const handleApprove = async (bucketId: number) => {
        if (!confirm('Approve this work item?')) return;

        setActionLoading(bucketId);
        try {
            const response = await fetch(`/api/worklog/${bucketId}/approve`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                fetchBuckets();
            } else {
                alert('Failed to approve');
            }
        } catch (error) {
            console.error('Failed to approve:', error);
            alert('Failed to approve');
        } finally {
            setActionLoading(null);
        }
    };

    const toggleExpand = (id: number) => {
        setExpandedBucketIds(prev =>
            prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]
        );
    };

    const startEdit = (bucket: Bucket) => {
        setEditingBucketId(bucket.id);
        setEditText(bucket.raw_text || '');
    };

    const cancelEdit = () => {
        setEditingBucketId(null);
        setEditText('');
    };

    const handleSaveEdit = async (bucketId: number) => {
        setActionLoading(bucketId);
        try {
            const response = await fetch(`/api/worklog/${bucketId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rawText: editText }),
            });
            if (response.ok) {
                setEditingBucketId(null);
                setEditText('');
                fetchBuckets();
            } else {
                alert('Failed to save');
            }
        } catch (error) {
            console.error('Failed to save:', error);
            alert('Failed to save');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (bucketId: number) => {
        if (!confirm('Reject this work item?')) return;

        setActionLoading(bucketId);
        try {
            const response = await fetch(`/api/worklog/${bucketId}/reject`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                fetchBuckets();
            } else {
                alert('Failed to reject');
            }
        } catch (error) {
            console.error('Failed to reject:', error);
            alert('Failed to reject');
        } finally {
            setActionLoading(null);
        }
    };

    // Helper to check if item is editable
    const isEditable = (status: string) => {
        return true; // All tickets are now editable
    };

    const startEditProject = (bucket: Bucket) => {
        setEditingProjectBucketId(bucket.id);
        setEditProjectId(bucket.project_id);
    };

    const cancelEditProject = () => {
        setEditingProjectBucketId(null);
        setEditProjectId(null);
    };

    const handleSaveProject = async (bucketId: number) => {
        if (editProjectId === null) return;

        setActionLoading(bucketId);
        try {
            const response = await fetch(`/api/worklog/${bucketId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ projectId: editProjectId }),
            });
            if (response.ok) {
                setEditingProjectBucketId(null);
                setEditProjectId(null);
                fetchBuckets();
            } else {
                alert('Failed to save');
            }
        } catch (error) {
            console.error('Failed to save:', error);
            alert('Failed to save');
        } finally {
            setActionLoading(null);
        }
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
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Tickets</h1>

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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        <div className="flex items-end">
                            <button
                                onClick={() => fetchBuckets()}
                                className="btn-primary"
                            >
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>

                {/* Buckets Table */}
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-2 py-3 w-10"></th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        ID
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Conf.
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Member
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Project
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Message
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {buckets.map((bucket) => {
                                    const isExpanded = expandedBucketIds.includes(bucket.id);
                                    return (
                                        <React.Fragment key={bucket.id}>
                                            <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(bucket.id)}>
                                                <td className="px-2 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => toggleExpand(bucket.id)}
                                                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 border rounded"
                                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                                    >
                                                        {isExpanded ? <ChevronDown /> : <ChevronRight />}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {bucket.id}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {formatDate(bucket.created_at)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(bucket.status)}`}>
                                                        {bucket.status?.toUpperCase().replace('_', ' ') || 'UNKNOWN'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-center">
                                                    <span
                                                        className={`text-lg ${getConfidenceColor(bucket.clarity_score)}`}
                                                        title={`Confidence: ${bucket.clarity_score ? Math.round(bucket.clarity_score * 100) + '%' : 'N/A'}`}
                                                    >
                                                        ●
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{bucket.member_name || bucket.member_phone || 'Unknown'}</div>
                                                    {bucket.member_name && <div className="text-xs text-gray-500">{bucket.member_phone}</div>}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    {editingProjectBucketId === bucket.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={editProjectId || ''}
                                                                onChange={(e) => setEditProjectId(Number(e.target.value) || null)}
                                                                className="text-sm border rounded px-2 py-1"
                                                            >
                                                                {projects.map((p) => (
                                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                onClick={() => handleSaveProject(bucket.id)}
                                                                disabled={actionLoading === bucket.id}
                                                                className="text-green-600 hover:text-green-800"
                                                                title="Save"
                                                            >
                                                                ✓
                                                            </button>
                                                            <button
                                                                onClick={cancelEditProject}
                                                                className="text-red-600 hover:text-red-800"
                                                                title="Cancel"
                                                            >
                                                                ✗
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-gray-900">{bucket.project_name}</span>
                                                            {/* Project is now always editable */}
                                                            <button
                                                                onClick={() => startEditProject(bucket)}
                                                                className="text-blue-600 hover:text-blue-800 text-xs"
                                                                title="Change project"
                                                            >
                                                                ✏️
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-900 line-clamp-2">
                                                        {bucket.raw_text || '(No text content)'}
                                                    </div>
                                                    {(bucket.image_urls || bucket.audio_urls) && (
                                                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                                            <Paperclip className="w-3 h-3" />
                                                            <span>Has attachments</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-2">
                                                        {(bucket.status === 'open' || bucket.status === 'pending_review') && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleApprove(bucket.id)}
                                                                    disabled={actionLoading === bucket.id}
                                                                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                                                                >
                                                                    {actionLoading === bucket.id ? '...' : 'Approve'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReject(bucket.id)}
                                                                    disabled={actionLoading === bucket.id}
                                                                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-gray-50">
                                                    <td colSpan={7} className="px-6 py-4">
                                                        <div className="text-sm text-gray-900 mb-4">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <strong>Full Message:</strong>
                                                                {isEditable(bucket.status) && editingBucketId !== bucket.id && (
                                                                    <button
                                                                        onClick={() => startEdit(bucket)}
                                                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                        <span>Edit</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {editingBucketId === bucket.id ? (
                                                                <div>
                                                                    <textarea
                                                                        value={editText}
                                                                        onChange={(e) => setEditText(e.target.value)}
                                                                        className="w-full p-2 border rounded text-sm min-h-[100px]"
                                                                    />
                                                                    <div className="flex gap-2 mt-2">
                                                                        <button
                                                                            onClick={() => handleSaveEdit(bucket.id)}
                                                                            disabled={actionLoading === bucket.id}
                                                                            className="btn-primary"
                                                                        >
                                                                            {actionLoading === bucket.id ? 'Saving...' : 'Save'}
                                                                        </button>
                                                                        <button
                                                                            onClick={cancelEdit}
                                                                            className="px-3 py-1 border text-sm rounded hover:bg-gray-50"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <p className="whitespace-pre-wrap mt-1">{bucket.raw_text}</p>
                                                            )}
                                                        </div>

                                                        {/* Transcripts */}
                                                        {bucket.transcripts && (() => {
                                                            try {
                                                                const transcripts = JSON.parse(bucket.transcripts);
                                                                if (Array.isArray(transcripts) && transcripts.length > 0) {
                                                                    return (
                                                                        <div className="mb-4">
                                                                            <strong>Transcripts:</strong>
                                                                            {transcripts.map((t: string, i: number) => (
                                                                                <p key={i} className="italic mt-1">"{t}"</p>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                }
                                                            } catch { return null; }
                                                            return null;
                                                        })()}

                                                        {/* Media */}
                                                        {(bucket.image_urls || bucket.audio_urls) && (
                                                            <div>
                                                                <strong>Attachments:</strong>
                                                                <div className="flex flex-wrap gap-4 mt-2">
                                                                    {/* Images */}
                                                                    {bucket.image_urls && (() => {
                                                                        try {
                                                                            const urls = JSON.parse(bucket.image_urls);
                                                                            if (Array.isArray(urls)) {
                                                                                return urls.map((url: string, i: number) => (
                                                                                    <a key={`img-${i}`} href={url} target="_blank" rel="noopener noreferrer">
                                                                                        <img src={url} alt={`Attachment ${i + 1}`} className="w-24 h-24 object-cover rounded border hover:opacity-80" />
                                                                                    </a>
                                                                                ));
                                                                            }
                                                                        } catch { return null; }
                                                                        return null;
                                                                    })()}
                                                                    {/* Audio */}
                                                                    {bucket.audio_urls && (() => {
                                                                        try {
                                                                            const urls = JSON.parse(bucket.audio_urls);
                                                                            if (Array.isArray(urls)) {
                                                                                return urls.map((url: string, i: number) => (
                                                                                    <div key={`audio-${i}`} className="flex items-center gap-2 bg-white px-3 py-2 rounded border">
                                                                                        <Music className="w-4 h-4 text-indigo-600" />
                                                                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">Voice Note {i + 1}</a>
                                                                                    </div>
                                                                                ));
                                                                            }
                                                                        } catch { return null; }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        )}



                                                        <div className="text-xs text-gray-500 mt-4">
                                                            Created: {formatDate(bucket.created_at)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {buckets.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No work entries found.
                            </div>
                        )}
                    </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-6">
                        <span className="text-sm text-gray-600">
                            Showing {buckets.length} of {total} work entries
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="px-3 py-1 text-sm">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}

