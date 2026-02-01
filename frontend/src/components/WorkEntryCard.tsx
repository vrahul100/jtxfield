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

    // Status color for card header bar only
    const getHeaderBgColor = (status: string): string => {
        switch (status.toLowerCase()) {
            case 'submitted':
                return 'bg-green-500';
            case 'pending_review':
                return 'bg-orange-500';
            case 'rejected':
                return 'bg-red-500';
            default:
                return 'bg-gray-200';
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
        <div className={`card overflow-hidden hover:shadow-lg transition-shadow bg-white ${isExpanded ? 'border-4 border-indigo-500' : ''}`}>
            {/* Card Header - Status Color Bar */}
            <div className={`h-4 ${getHeaderBgColor(bucket.status)}`}></div>
            <div
                className={`p-4 cursor-pointer ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                onClick={onToggleExpand}
            >
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-md font-mono text-gray-500">#{bucket.id}</span>
                                <span className={`px-2 py-0.5 text-md font-semibold rounded border ${getStatusColor(bucket.status)}`}>
                                    {bucket.status?.toUpperCase().replace('_', ' ')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <div className="text-md text-gray-500 whitespace-nowrap">{formatDate(bucket.created_at)}</div>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-xs text-gray-500">{bucket.member_name || bucket.member_phone || 'Unknown'}</span>
                                        <span className="bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-xs text-gray-600">
                                            {bucket.member_name ? 
                                                bucket.member_name.split(' ').map(n => n[0]).join('').toUpperCase() :
                                                (bucket.member_phone ? bucket.member_phone.slice(-2) : 'U')
                                            }
                                        </span>
                                    </div>
                                </div>
                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-gray-400 mt-1" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-400 mt-1" />
                                )}
                            </div>
                        </div>

                        {/* Project and Summary */}
                        <div className="mb-3">
                            <div className="flex items-center gap-1 text-md text-gray-600 mb-1">
                                <span>📍</span>
                                <span className="font-medium">{bucket.project_name || 'No Project'}</span>
                            </div>
                            {bucket.summary ? (
                                <div className="flex items-start gap-1">
                                    <span className="text-base">🤖</span>
                                    <p className="text-md text-gray-700 italic">{bucket.summary}</p>
                                </div>
                            ) : (
                                <p className="text-md text-gray-700">{bucket.raw_text || '(No content)'}</p>
                            )}
                        </div>

                        {/* Details in 2-column grid */}
                        <div className="pt-2 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                                {/* Attachments */}
                                {hasAttachments && (
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium text-gray-500 mb-0.5">Attachments</span>
                                        <div className="flex items-center gap-1 text-blue-600">
                                            <Paperclip className="w-3 h-3" />
                                            <span className="text-md">View</span>
                                        </div>
                                    </div>
                                )}
                                
                                {/* AI Confidence */}
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium text-gray-500 mb-0.5">AI Confidence</span>
                                    <div className="flex items-center gap-1">
                                        <Circle className={`w-3 h-3 fill-current ${getConfidenceColor(bucket.clarity_score)}`} />
                                        <span className="text-md text-gray-600">
                                            {bucket.clarity_score ? `${Math.round(bucket.clarity_score * 100)}%` : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Potential Change */}
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium text-gray-500 mb-0.5">Status</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleChange();
                                        }}
                                        className={`flex items-center gap-1 text-left ${bucket.potential_change ? 'text-orange-600' : 'text-gray-500'}`}
                                    >
                                        <AlertTriangle className="w-3.5 h-3.5" fill={bucket.potential_change ? 'currentColor' : 'none'} />
                                        <span className="text-md">
                                            {bucket.potential_change ? 'Change Flagged' : 'No Issues'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="p-4 bg-gray-50 border-t">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Column: AI Summary + Attachments */}
                        <div className="space-y-3">
                            {/* AI Summary (if not already shown) */}
                            {bucket.summary && (
                                <div className="p-3 bg-gray-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-black font-semibold uppercase text-md">🤖 AI Summary</span>
                                    </div>
                                    <p className="text-gray-700 italic text-md">{bucket.summary}</p>
                                </div>
                            )}

                            {/* Transcripts */}
                            {bucket.transcripts && (() => {
                                try {
                                    const transcripts = JSON.parse(bucket.transcripts);
                                    if (Array.isArray(transcripts) && transcripts.length > 0) {
                                        return (
                                            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                                <span className="text-black font-semibold uppercase text-md">🎤 Voice Transcripts</span>
                                                {transcripts.map((t: string, i: number) => (
                                                    <p key={i} className="text-md italic mt-2 text-gray-700">"{t}"</p>
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
                                    <span className="text-black font-semibold uppercase text-md">📎 Attachments</span>
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
                                                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-md">Voice Note {i + 1}</a>
                                                        </div>
                                                    ));
                                                }
                                            } catch { return null; }
                                            return null;
                                        })()}
                                    </div>
                                </div>
                            )}

                            <div className="text-md text-gray-500">
                                Created: {formatDate(bucket.created_at)}
                            </div>
                        </div>

                        {/* Right Column: WhatsApp-style Conversation */}
                        <div>
                            <span className="text-black font-semibold uppercase text-md mb-2 block">💬 Conversation</span>
                            <div className="space-y-2 bg-[#E5DDD5] rounded-lg p-3 min-h-[200px] max-h-[400px] overflow-y-auto" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c9c2b8\' fill-opacity=\'0.3\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                                {bucket.conversation_history && Array.isArray(bucket.conversation_history) ? (
                                    bucket.conversation_history.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[75%] px-3 py-2 rounded-lg text-md shadow ${msg.role === 'user'
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
                                        <div className="max-w-[75%] px-3 py-2 rounded-lg rounded-tr-none text-md shadow bg-green-100 text-gray-900">
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
                            className="flex items-center gap-1 px-3 py-1.5 text-md text-green-600 hover:bg-green-50 rounded transition-colors"
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
                            className="flex items-center gap-1 px-3 py-1.5 text-md text-red-600 hover:bg-red-50 rounded transition-colors"
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
                    className="flex items-center gap-1 px-3 py-1.5 text-md text-blue-600 hover:bg-gray-50 rounded transition-colors"
                    title="Edit"
                >
                    <PencilIcon className="w-4 h-4" strokeWidth={3} />
                    Edit
                </button>
            </div>
        </div>
    );
}
