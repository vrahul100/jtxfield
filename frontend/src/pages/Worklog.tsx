import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';

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
    created_at: string;
    updated_at?: string;
}

export function Worklog() {
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        setPage(1); // Reset to page 1 when filters change
    }, [statusFilter, sortBy, sortOrder, search]);

    useEffect(() => {
        fetchBuckets();
    }, [statusFilter, sortBy, sortOrder, search, page]);

    const fetchBuckets = async () => {
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
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
                return 'bg-blue-100 text-blue-800';
            case 'closed':
                return 'bg-yellow-100 text-yellow-800';
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'processing':
                return 'bg-purple-100 text-purple-800';
            case 'pending_review':
                return 'bg-orange-100 text-orange-800';
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
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Work Reported</h1>

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
                                <option value="closed">Closed</option>
                                <option value="processing">Processing</option>
                                <option value="completed">Completed</option>
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
                    </div>
                </div>

                {/* Buckets List */}
                <div className="space-y-4">
                    {buckets.map((bucket) => (
                        <div key={bucket.id} className="card p-6">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                                            bucket.status
                                        )}`}
                                    >
                                        {bucket.status?.toUpperCase().replace('_', ' ') || 'UNKNOWN'}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        Bucket #{bucket.id}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-500">
                                        {formatDate(bucket.created_at)}
                                    </span>
                                    {bucket.status !== 'completed' && (
                                        <button
                                            onClick={() => handleApprove(bucket.id)}
                                            disabled={actionLoading === bucket.id}
                                            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                        >
                                            {actionLoading === bucket.id ? 'Approving...' : '✓ Approve'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                    <span className="text-sm font-medium text-gray-600">Member:</span>
                                    <span className="ml-2 text-gray-900">
                                        {bucket.member_name || bucket.member_phone || 'Unknown'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-gray-600">Project:</span>
                                    <span className="ml-2 text-gray-900">
                                        {bucket.project_name || 'Unassigned'}
                                    </span>
                                </div>
                            </div>

                            {bucket.raw_text && (
                                <div className="border-t pt-3">
                                    <p className="text-sm font-medium text-gray-600 mb-1">Message:</p>
                                    <p className="text-gray-900 whitespace-pre-wrap">{bucket.raw_text}</p>
                                </div>
                            )}

                            {/* Transcripts */}
                            {bucket.transcripts && (() => {
                                try {
                                    const transcripts = JSON.parse(bucket.transcripts);
                                    if (Array.isArray(transcripts) && transcripts.length > 0) {
                                        return (
                                            <div className="border-t pt-3 mt-3">
                                                <p className="text-sm font-medium text-gray-600 mb-1">🎤 Voice Transcripts:</p>
                                                {transcripts.map((t: string, i: number) => (
                                                    <p key={i} className="text-gray-900 italic">"{t}"</p>
                                                ))}
                                            </div>
                                        );
                                    }
                                } catch { return null; }
                                return null;
                            })()}

                            {/* Media Section */}
                            {(bucket.image_urls || bucket.audio_urls) && (
                                <div className="border-t pt-3 mt-3">
                                    <p className="text-sm font-medium text-gray-600 mb-2">📎 Attachments:</p>
                                    <div className="flex flex-wrap gap-4">
                                        {/* Images */}
                                        {bucket.image_urls && (() => {
                                            try {
                                                const urls = JSON.parse(bucket.image_urls);
                                                if (Array.isArray(urls)) {
                                                    return urls.map((url: string, i: number) => (
                                                        <a
                                                            key={`img-${i}`}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block"
                                                        >
                                                            <img
                                                                src={url}
                                                                alt={`Attachment ${i + 1}`}
                                                                className="w-24 h-24 object-cover rounded border hover:opacity-80 transition"
                                                            />
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
                                                        <div key={`audio-${i}`} className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded">
                                                            <span className="text-lg">🎵</span>
                                                            <a
                                                                href={url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 hover:underline text-sm"
                                                            >
                                                                Voice Note {i + 1}
                                                            </a>
                                                        </div>
                                                    ));
                                                }
                                            } catch { return null; }
                                            return null;
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {buckets.length === 0 && (
                        <div className="card p-8 text-center text-gray-500">
                            No work entries found. Workers can send updates via WhatsApp/SMS.
                        </div>
                    )}
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

