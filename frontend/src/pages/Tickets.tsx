import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { EditModal, EditField } from '../components/EditModal';

import { PencilIcon } from 'lucide-react';

import {
    Paperclip,
    SquareChevronDown,
    Circle,
    Check,
    X,
    AlertTriangle,
    SquareChevronLeft,
    SquareChevronRight,
    Music
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



    const toggleExpand = (id: number) => {
        setExpandedBucketIds(prev =>
            prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]
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
                rawText: values.message,
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
                name: 'message',
                label: 'Message',
                type: 'textarea',
                value: editingBucket.raw_text,
                rows: 4,
            },
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
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Mark work that may indicate a scope change">
                                        ⚠️ Change?
                                    </th>

                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        AI Confidence
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
                                            <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-amber-50' : ''}`} onClick={() => toggleExpand(bucket.id)}>
                                                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => toggleExpand(bucket.id)}
                                                        className="w-6 h-6 p-1 hover:bg-gray-200 rounded "
                                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                                    >
                                                        {isExpanded ? <SquareChevronDown strokeWidth={3} className="w-6 h-6" /> : <SquareChevronRight strokeWidth={3} className="w-6 h-6" />}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs">
                                                    {bucket.id}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs">
                                                    {formatDate(bucket.created_at)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(bucket.status)}`}>
                                                        {bucket.status?.toUpperCase().replace('_', ' ') || 'UNKNOWN'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleTogglePotentialChange(bucket.id, bucket.potential_change)}
                                                        className={`p-1 rounded hover:bg-amber-100 transition-colors ${bucket.potential_change ? 'text-orange-600' : 'text-gray-300 hover:text-orange-500'}`}
                                                        title={bucket.potential_change ? 'Marked as potential scope change - click to clear' : 'Click to mark as potential scope change'}
                                                    >
                                                        <AlertTriangle className="w-6 h-6" fill={bucket.potential_change ? 'currentColor' : 'none'} strokeWidth={3} />
                                                    </button>
                                                </td>

                                                <td className="px-4 py-4 text-center">
                                                    <div
                                                        className="flex justify-center items-center"
                                                        title={
                                                            (bucket.clarity_score ?? 0.5) >= 0.8
                                                                ? `High Confidence (${Math.round((bucket.clarity_score ?? 0.5) * 100)}%): AI is very confident in the extracted data`
                                                                : (bucket.clarity_score ?? 0.5) >= 0.5
                                                                    ? `Medium Confidence (${Math.round((bucket.clarity_score ?? 0.5) * 100)}%): AI extracted data but has some uncertainty`
                                                                    : `Low Confidence (${Math.round((bucket.clarity_score ?? 0.5) * 100)}%): AI is unsure - review recommended`
                                                        }
                                                    >
                                                        <Circle className={`w-4 h-4 fill-current ${getConfidenceColor(bucket.clarity_score)}`} />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-xs font-medium text-gray-900">{bucket.member_name || bucket.member_phone || 'Unknown'}</div>
                                                    {bucket.member_name && <div className="text-xs text-gray-500">{bucket.member_phone}</div>}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-xs text-gray-900">{bucket.project_name}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {bucket.summary ? (
                                                        <>
                                                            <div className="text-xs text-gray-900 font-medium flex items-center gap-1">
                                                                <span>✨</span>
                                                                <span className="italic">{bucket.summary}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 line-clamp-1 mt-1">
                                                                {bucket.raw_text}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-xs text-gray-900 line-clamp-2">
                                                            {bucket.raw_text || '(No text content)'}
                                                        </div>
                                                    )}
                                                    {(bucket.image_urls || bucket.audio_urls) && (
                                                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                                            <Paperclip className="w-3 h-3" />
                                                            <span>Has attachments</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-3">
                                                        {/* Show submit/reject for any ticket not already submitted */}
                                                        {['pending_review', 'processing', 'open', 'flagged'].includes(bucket.status) && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleSubmit(bucket.id)}
                                                                    className="flex items-center gap-1 text-green-600 hover:text-green-800"
                                                                    title="Approve & Submit"
                                                                >
                                                                    <Check className="w-6 h-6" strokeWidth={3} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReject(bucket.id)}
                                                                    className="flex items-center gap-1 text-red-600 hover:text-red-800"
                                                                    title="Reject"
                                                                >
                                                                    <X className="w-6 h-6" strokeWidth={3} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => handleEdit(bucket)}
                                                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                                            title="Edit"
                                                        >
                                                            <PencilIcon className="w-6 h-6" strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-amber-50">
                                                    <td colSpan={10} className="px-6 py-4">
                                                        <div className="text-xs text-gray-900 mb-4">


                                                            {/* AI Summary */}
                                                            {bucket.summary && (
                                                                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-gray-500 mb-2">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-black font-semibold uppercase text-xs">✨ AI Summary:</span>
                                                                    </div>
                                                                    <p className="text-gray-700 italic">{bucket.summary}</p>
                                                                </div>
                                                            )}

                                                            {/* WhatsApp-style Conversation */}
                                                            <div className="mt-4">
                                                                <span className='ttx-title'>Conversation:</span>
                                                                <div className="mt-2 space-y-2 max-w-2xl bg-gray-100 rounded-lg p-3" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4d4d4\' fill-opacity=\'0.2\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                                                                    {bucket.conversation_history && Array.isArray(bucket.conversation_history) ? (
                                                                        bucket.conversation_history.map((msg, i) => (
                                                                            <div
                                                                                key={i}
                                                                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                                                            >
                                                                                <div
                                                                                    className={`max-w-[80%] px-3 py-2 rounded-lg text-xs shadow-sm ${msg.role === 'user'
                                                                                            ? 'bg-[#DCF8C6] text-gray-900 rounded-br-none'
                                                                                            : 'bg-white text-gray-900 rounded-bl-none'
                                                                                        }`}
                                                                                >
                                                                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                                                                    {msg.timestamp && (
                                                                                        <p className="text-[10px] text-gray-500 mt-1 text-right">
                                                                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        /* Fallback to raw_text if no conversation history */
                                                                        <div className="flex justify-end">
                                                                            <div className="max-w-[80%] px-3 py-2 rounded-lg rounded-br-none text-xs shadow-sm bg-[#DCF8C6] text-gray-900">
                                                                                <p className="whitespace-pre-wrap">{bucket.raw_text || '(No message)'}</p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Transcripts */}
                                                        {bucket.transcripts && (() => {
                                                            try {
                                                                const transcripts = JSON.parse(bucket.transcripts);
                                                                if (Array.isArray(transcripts) && transcripts.length > 0) {
                                                                    return (
                                                                        <div className="mb-4">
                                                                            <span className='ttx-title'>Transcripts:</span>
                                                                            {transcripts.map((t: string, i: number) => (
                                                                                <p key={i} className="text-xs italic mt-1">"{t}"</p>
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
                                                                                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Voice Note {i + 1}</a>
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

