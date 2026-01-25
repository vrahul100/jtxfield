import {
    Paperclip,
    Circle,
    Check,
    X,
    AlertTriangle,
    PencilIcon,
    Music,
    ChevronDown,
    ChevronUp
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

interface WorkEntryCardProps {
    bucket: Bucket;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onEdit: () => void;
    onSubmit: () => void;
    onReject: () => void;
    onToggleChange: () => void;
}

export function WorkEntryCard({
    bucket,
    isExpanded,
    onToggleExpand,
    onEdit,
    onSubmit,
    onReject,
    onToggleChange
}: WorkEntryCardProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open':
                return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'submitted':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'pending_review':
                return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'rejected':
                return 'bg-red-200 text-red-900 border-red-300';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getCardBgColor = (status: string) => {
        switch (status) {
            case 'submitted':
                return 'bg-green-50';
            case 'pending_review':
                return 'bg-orange-50';
            case 'rejected':
                return 'bg-red-50';
            case 'open':
                return 'bg-white';
            default:
                return 'bg-white';
        }
    };

    const getConfidenceColor = (score: number | null | undefined) => {
        if (score === null || score === undefined) return 'text-gray-400';
        if (score >= 0.7) return 'text-green-600';
        if (score >= 0.4) return 'text-yellow-600';
        return 'text-red-600';
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

    const hasAttachments = bucket.image_urls || bucket.audio_urls;
    const showActions = ['pending_review', 'processing', 'open', 'flagged'].includes(bucket.status);

    return (
        <div className={`card overflow-hidden hover:shadow-lg transition-shadow ${getCardBgColor(bucket.status)} ${isExpanded ? 'border-4 border-indigo-500' : ''}`}>
            {/* Card Header */}
            <div
                className={`p-4 border-b cursor-pointer ${isExpanded ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                onClick={onToggleExpand}
            >
                <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-mono text-gray-500">#{bucket.id}</span>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getStatusColor(bucket.status)}`}>
                                {bucket.status?.toUpperCase().replace('_', ' ')}
                            </span>
                        </div>

                        {/* AI Summary or Raw Text */}
                        {bucket.summary ? (
                            <div className="mb-2">
                                <div className="flex items-start gap-1">
                                    <span className="text-base">✨</span>
                                    <p className="text-sm font-medium text-gray-900 italic">{bucket.summary}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-900 mb-2 line-clamp-2">{bucket.raw_text || '(No content)'}</p>
                        )}

                        {/* Member and Project */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                <span>👤</span>
                                <span className="font-medium">{bucket.member_name || bucket.member_phone || 'Unknown'}</span>
                                {bucket.member_name && <span className="text-gray-400">({bucket.member_phone})</span>}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                <span>📍</span>
                                <span className="font-medium">{bucket.project_name}</span>
                            </div>
                        </div>

                        {/* Quick Indicators */}
                        <div className="flex items-center gap-3 mt-2">
                            {hasAttachments && (
                                <div className="flex items-center gap-1 text-blue-600" title="Has attachments">
                                    <Paperclip className="w-3 h-3" />
                                    <span className="text-xs">Attachments</span>
                                </div>
                            )}
                            <div
                                className="flex items-center gap-1"
                                title={
                                    (bucket.clarity_score ?? 0.5) >= 0.8
                                        ? `High Confidence (${Math.round((bucket.clarity_score ?? 0.5) * 100)}%)`
                                        : (bucket.clarity_score ?? 0.5) >= 0.5
                                            ? `Medium Confidence (${Math.round((bucket.clarity_score ?? 0.5) * 100)}%)`
                                            : `Low Confidence (${Math.round((bucket.clarity_score ?? 0.5) * 100)}%)`
                                }
                            >
                                <Circle className={`w-3 h-3 fill-current ${getConfidenceColor(bucket.clarity_score)}`} />
                                <span className="text-xs text-gray-600">AI</span>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleChange();
                                }}
                                className={`p-0.5 rounded transition-colors ${bucket.potential_change ? 'text-orange-600' : 'text-gray-300 hover:text-orange-500'}`}
                                title={bucket.potential_change ? 'Flagged as potential change' : 'Not flagged'}
                            >
                                <AlertTriangle className="w-4 h-4" fill={bucket.potential_change ? 'currentColor' : 'none'} />
                            </button>
                        </div>
                    </div>

                    {/* Date and Expand Icon */}
                    <div className="flex flex-col items-end gap-2">
                        <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(bucket.created_at)}</span>
                        {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="p-4 bg-blue-50 border-t">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Column: AI Summary + Attachments */}
                        <div className="space-y-3">
                            {/* AI Summary (if not already shown) */}
                            {bucket.summary && (
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-black font-semibold uppercase text-xs">✨ AI Summary</span>
                                    </div>
                                    <p className="text-gray-700 italic text-sm">{bucket.summary}</p>
                                </div>
                            )}

                            {/* Transcripts */}
                            {bucket.transcripts && (() => {
                                try {
                                    const transcripts = JSON.parse(bucket.transcripts);
                                    if (Array.isArray(transcripts) && transcripts.length > 0) {
                                        return (
                                            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                                <span className="text-black font-semibold uppercase text-xs">🎤 Voice Transcripts</span>
                                                {transcripts.map((t: string, i: number) => (
                                                    <p key={i} className="text-xs italic mt-2 text-gray-700">"{t}"</p>
                                                ))}
                                            </div>
                                        );
                                    }
                                } catch { return null; }
                                return null;
                            })()}

                            {/* Attachments */}
                            {hasAttachments && (
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <span className="text-black font-semibold uppercase text-xs">📎 Attachments</span>
                                    <div className="flex flex-wrap gap-3 mt-2">
                                        {/* Images */}
                                        {bucket.image_urls && (() => {
                                            try {
                                                const urls = JSON.parse(bucket.image_urls);
                                                if (Array.isArray(urls)) {
                                                    return urls.map((url: string, i: number) => (
                                                        <a key={`img-${i}`} href={url} target="_blank" rel="noopener noreferrer">
                                                            <img src={url} alt={`Attachment ${i + 1}`} className="w-20 h-20 object-cover rounded border hover:opacity-80 shadow-sm" />
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
                                                        <div key={`audio-${i}`} className="flex items-center gap-2 bg-white px-3 py-2 rounded border shadow-sm">
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

                            <div className="text-xs text-gray-500">
                                Created: {formatDate(bucket.created_at)}
                            </div>
                        </div>

                        {/* Right Column: WhatsApp-style Conversation */}
                        <div>
                            <span className="text-black font-semibold uppercase text-xs mb-2 block">💬 Conversation</span>
                            <div className="space-y-2 bg-[#E5DDD5] rounded-lg p-3 min-h-[200px] max-h-[400px] overflow-y-auto" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c9c2b8\' fill-opacity=\'0.3\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                                {bucket.conversation_history && Array.isArray(bucket.conversation_history) ? (
                                    bucket.conversation_history.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[75%] px-3 py-2 rounded-lg text-xs shadow ${msg.role === 'user'
                                                    ? 'bg-green-100 text-gray-900 rounded-tr-none'
                                                    : 'bg-white text-gray-900 rounded-tl-none'
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
                                    <div className="flex justify-end">
                                        <div className="max-w-[75%] px-3 py-2 rounded-lg rounded-tr-none text-xs shadow bg-green-100 text-gray-900">
                                            <p className="whitespace-pre-wrap">{bucket.raw_text || '(No message)'}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="p-3 bg-gray-50 border-t flex gap-2 justify-end">
                {showActions && (
                    <>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSubmit();
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Approve & Submit"
                        >
                            <Check className="w-4 h-4" strokeWidth={3} />
                            Submit
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReject();
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Reject"
                        >
                            <X className="w-4 h-4" strokeWidth={3} />
                            Reject
                        </button>
                    </>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit"
                >
                    <PencilIcon className="w-4 h-4" strokeWidth={3} />
                    Edit
                </button>
            </div>
        </div>
    );
}
