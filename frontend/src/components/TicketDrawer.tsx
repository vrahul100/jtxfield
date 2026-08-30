import { useState, useMemo } from 'react';
import {
    X,
    Check,
    AlertTriangle,
    Pencil,
    MessageSquare,
    Layers,
    User,
    Sparkles,
    FileText,
    Image as ImageIcon,
    Mic,
    Maximize2,
    ChevronLeft,
    ChevronRight,
    Volume2,
    Copy,
} from 'lucide-react';
import { AudioPlayerChip } from './AudioPlayerChip';
import { ImageLightbox } from './ImageLightbox';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    media?: string[];
    timestamp?: string;
}

export interface Bucket {
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
    node_rate?: number;
    worker_rate?: number;
    worker_role?: string;
    base_rate?: number;
    is_flagged?: boolean;
    flag_type?: string | null;
    flag_reason?: string | null;
    reviewed_by?: number | null;
    reviewed_at?: string | null;
    type?: string;
    wa_sent_timestamp?: string;
    wa_received_timestamp?: string;
}

interface TicketDrawerProps {
    bucket: Bucket | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
    onSubmit: () => void;
    onReject: () => void;
    onToggleChange: () => void;
    onUpdateHours?: (hours: number | null) => void;
}

const formatTicketCode = (nodeName?: string, id?: number) => {
    if (!id) return '#-';
    const prefix = (nodeName ? nodeName.substring(0, 3).toUpperCase() : 'ACE');
    return `${prefix}-${10000 + id}`;
};

export function TicketDrawer({
    bucket,
    isOpen,
    onClose,
    onEdit,
    onSubmit,
    onReject,
    onToggleChange,
    onUpdateHours,
}: TicketDrawerProps) {
    const [activeTab, setActiveTab] = useState<'whatsapp' | 'data'>('whatsapp');
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [mediaSliderIndex, setMediaSliderIndex] = useState(0);
    const [copiedTranscript, setCopiedTranscript] = useState(false);

    // Parse image URLs safely
    const parsedImages: string[] = useMemo(() => {
        if (!bucket?.image_urls) return [];
        try {
            const parsed = JSON.parse(bucket.image_urls);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, [bucket?.image_urls]);

    // Parse audio URLs safely
    const parsedAudio: string[] = useMemo(() => {
        if (!bucket?.audio_urls) return [];
        try {
            const parsed = JSON.parse(bucket.audio_urls);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, [bucket?.audio_urls]);

    // Parse transcripts safely
    const parsedTranscripts: string[] = useMemo(() => {
        if (!bucket?.transcripts) return [];
        try {
            const parsed = JSON.parse(bucket.transcripts);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, [bucket?.transcripts]);

    // Aggregate all media (images and audio) for slider
    const allMedia = useMemo(() => {
        const items: Array<{ type: 'image' | 'audio'; url: string; imageIndex?: number; audioIndex?: number }> = [];
        parsedImages.forEach((url, i) => items.push({ type: 'image', url, imageIndex: i }));
        parsedAudio.forEach((url, i) => items.push({ type: 'audio', url, audioIndex: i }));
        return items;
    }, [parsedImages, parsedAudio]);

    if (!isOpen || !bucket) return null;

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'open':
                return 'bg-indigo-600 text-white font-bold border-indigo-700 shadow-2xs';
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

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatTimeOnly = (dateString?: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const getTimeIntegrity = () => {
        if (!bucket.wa_sent_timestamp || !bucket.wa_received_timestamp) {
            return { label: 'Verified', color: 'text-emerald-800 bg-emerald-100 border-emerald-300 font-bold' };
        }
        const sent = new Date(bucket.wa_sent_timestamp).getTime();
        const received = new Date(bucket.wa_received_timestamp).getTime();
        const diffHours = Math.abs(received - sent) / (1000 * 60 * 60);

        if (diffHours > 24) return { label: 'Delayed (>24h)', color: 'text-rose-800 bg-rose-100 border-rose-300 font-bold' };
        if (diffHours > 4) return { label: 'Delayed (>4h)', color: 'text-amber-900 bg-amber-100 border-amber-300 font-bold' };
        return { label: 'Verified', color: 'text-emerald-800 bg-emerald-100 border-emerald-300 font-bold' };
    };

    const openLightbox = (index: number) => {
        setLightboxIndex(index);
        setLightboxOpen(true);
    };

    const showReviewActions = ['pending_review', 'processing', 'open', 'flagged'].includes(bucket.status);
    const integrity = getTimeIntegrity();
    const rate = bucket.worker_rate || bucket.node_rate || 85;
    const hours = bucket.hours || 0;
    const laborCost = hours * rate;
    const billableTotal = laborCost * 1.2;

    return (
        <>
            {/* Drawer Container (Side Panel) */}
            <div className="w-full lg:w-[540px] xl:w-[600px] flex-shrink-0 flex flex-col h-full bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden transition-all animate-in slide-in-from-right duration-200 z-10">
                
                {/* 1. Drawer Header */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-slate-950 text-lg tracking-tight">
                                {formatTicketCode(bucket.node_name, bucket.id)}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${getStatusColor(bucket.status)}`}>
                                {bucket.status?.replace('_', ' ')}
                            </span>
                            {bucket.potential_change && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 fill-amber-300" />
                                    Flagged CO
                                </span>
                            )}
                        </div>

                        <button
                            onClick={onClose}
                            className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                            title="Close Drawer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Quick Action Toolbar */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {showReviewActions && (
                                <>
                                    <button
                                        onClick={onSubmit}
                                        className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold shadow-xs transition-colors cursor-pointer"
                                        title="Approve & Submit Transaction"
                                    >
                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        Submit CO
                                    </button>
                                    <button
                                        onClick={onReject}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-md text-xs font-bold transition-colors cursor-pointer"
                                        title="Reject Ticket"
                                    >
                                        <X className="w-3.5 h-3.5 stroke-[3]" />
                                        Reject
                                    </button>
                                </>
                            )}

                            <button
                                onClick={onToggleChange}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                                    bucket.potential_change
                                        ? 'bg-amber-100 text-amber-900 border-amber-400 hover:bg-amber-200'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                }`}
                                title={bucket.potential_change ? 'Remove Potential Change Flag' : 'Flag as Potential Change Order'}
                            >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 fill-amber-200" />
                                {bucket.potential_change ? 'Unflag' : 'Flag CO'}
                            </button>

                            <button
                                onClick={onEdit}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md text-xs font-bold transition-colors cursor-pointer"
                                title="Edit Project & Classification"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                            </button>
                        </div>

                        <span className="text-[11px] text-slate-600 font-semibold">
                            {formatDate(bucket.created_at)}
                        </span>
                    </div>
                </div>

                {/* 2. Drawer Tab Switcher */}
                <div className="flex border-b border-slate-200 bg-slate-100/90 px-4 pt-1.5 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
                            activeTab === 'whatsapp'
                                ? 'border-emerald-600 text-emerald-900 bg-white rounded-t-md shadow-2xs'
                                : 'border-transparent text-slate-600 hover:text-slate-900 font-semibold'
                        }`}
                    >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        WhatsApp Context
                        {(parsedAudio.length > 0 || parsedImages.length > 0) && (
                            <span className="ml-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                {parsedAudio.length + parsedImages.length}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('data')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
                            activeTab === 'data'
                                ? 'border-indigo-600 text-indigo-900 bg-white rounded-t-md shadow-2xs'
                                : 'border-transparent text-slate-600 hover:text-slate-900 font-semibold'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        Data & Evidence
                    </button>
                </div>

                {/* 3. Drawer Scrollable Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3.5 bg-slate-100/40 space-y-3.5">

                    {/* Inconsistency & Flagged Alert Card (If Ticket is Flagged) */}
                    {(bucket.is_flagged || bucket.flag_reason) && (
                        <div className="p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl shadow-xs space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center text-amber-900 flex-shrink-0">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                    </div>
                                    <div>
                                        <span className="text-xs font-black uppercase tracking-wider text-amber-950 block">
                                            Inconsistency Flagged
                                        </span>
                                        <span className="inline-block px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-amber-200/70 text-amber-900 border border-amber-300 mt-0.5">
                                            {bucket.flag_type ? bucket.flag_type.replace('_', ' ') : 'Review Required'}
                                        </span>
                                    </div>
                                </div>
                                {onSubmit && (
                                    <button
                                        onClick={onSubmit}
                                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                                        title="Resolve Flag & Approve"
                                    >
                                        <Check className="w-3 h-3" />
                                        Resolve & Approve
                                    </button>
                                )}
                            </div>

                            <p className="text-xs text-amber-900 font-semibold leading-relaxed pl-8">
                                {bucket.flag_reason || 'AI analysis detected a discrepancy between media, voice transcript, or entered scope.'}
                            </p>

                            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between text-[11px] text-amber-800 pl-8">
                                <span>Manager Review: Verify whether to keep AI scope or adjust hours.</span>
                                <button
                                    onClick={onEdit}
                                    className="text-indigo-700 font-bold hover:underline cursor-pointer"
                                >
                                    Adjust Details →
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* TAB 1: WhatsApp Thread */}
                    {activeTab === 'whatsapp' && (
                        <div className="space-y-3">
                            {/* WhatsApp Chat Canvas */}
                            <div 
                                className="rounded-xl border-2 border-slate-300 p-3 sm:p-4 space-y-3 min-h-[320px] max-h-[500px] overflow-y-auto shadow-inner"
                                style={{
                                    backgroundColor: '#ECE5DD',
                                    backgroundImage: 'radial-gradient(#c5bbb0 0.85px, transparent 0.85px)',
                                    backgroundSize: '12px 12px'
                                }}
                            >
                                <div className="text-center">
                                    <span className="inline-block px-3.5 py-1 rounded-full bg-white/95 text-xs font-bold text-slate-800 shadow-xs border border-slate-200">
                                        WhatsApp Conversation • {formatDate(bucket.created_at)}
                                    </span>
                                </div>

                                {bucket.conversation_history && Array.isArray(bucket.conversation_history) && bucket.conversation_history.length > 0 ? (
                                    bucket.conversation_history.map((msg, i) => {
                                        const isUser = msg.role === 'user';
                                        return (
                                            <div
                                                key={i}
                                                className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                                            >
                                                <div
                                                    className={`max-w-[88%] rounded-2xl px-4 py-2.5 shadow-xs space-y-1.5 ${
                                                        isUser
                                                            ? 'bg-white text-slate-950 rounded-tl-xs border border-slate-300'
                                                            : 'bg-[#DCF8C6] text-slate-950 rounded-tr-xs border border-emerald-300'
                                                    }`}
                                                >
                                                    {/* Sender tag */}
                                                    <div className="flex items-center justify-between gap-2 text-xs font-bold">
                                                        <span className={isUser ? 'text-indigo-900' : 'text-emerald-950 font-black'}>
                                                            {isUser ? (bucket.member_name || bucket.member_phone || 'Worker') : 'Jentyx Assistant'}
                                                        </span>
                                                    </div>

                                                    <p className="whitespace-pre-wrap leading-relaxed text-sm font-normal text-slate-950">
                                                        {msg.content}
                                                    </p>

                                                    {/* If first user message, attach audio and image chips inside bubble */}
                                                    {isUser && i === 0 && (
                                                        <>
                                                            {parsedAudio.length > 0 && (
                                                                <div className="pt-1.5 space-y-1.5">
                                                                    {parsedAudio.map((audioUrl, aIdx) => (
                                                                        <AudioPlayerChip key={aIdx} src={audioUrl} label={`Voice Note ${aIdx + 1}`} />
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {parsedImages.length > 0 && (
                                                                <div className="grid grid-cols-2 gap-2 pt-1.5">
                                                                    {parsedImages.map((imgUrl, imgIdx) => (
                                                                        <button
                                                                            key={imgIdx}
                                                                            type="button"
                                                                            onClick={() => openLightbox(imgIdx)}
                                                                            className="relative group overflow-hidden rounded-lg border border-slate-300 aspect-4/3 cursor-pointer shadow-xs"
                                                                        >
                                                                            <img
                                                                                src={imgUrl}
                                                                                alt="Chat attachment"
                                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                            />
                                                                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {msg.timestamp && (
                                                        <div className="text-[11px] text-slate-600 font-medium text-right leading-none pt-0.5">
                                                            {formatTimeOnly(msg.timestamp)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    /* Fallback when conversation_history is not structured */
                                    <div className="space-y-3">
                                        <div className="flex flex-col items-start">
                                            <div className="max-w-[88%] rounded-2xl rounded-tl-xs px-4 py-2.5 shadow-xs bg-white text-slate-950 border border-slate-300 space-y-1.5">
                                                <div className="flex items-center justify-between gap-2 text-xs font-bold text-indigo-900">
                                                    <span>{bucket.member_name || bucket.member_phone || 'Worker'}</span>
                                                </div>

                                                <p className="whitespace-pre-wrap leading-relaxed text-sm font-normal text-slate-950">
                                                    {bucket.raw_text || '(No text content)'}
                                                </p>

                                                {parsedAudio.length > 0 && (
                                                    <div className="pt-1.5 space-y-1.5">
                                                        {parsedAudio.map((audioUrl, aIdx) => (
                                                            <AudioPlayerChip key={aIdx} src={audioUrl} label={`Voice Note ${aIdx + 1}`} />
                                                        ))}
                                                    </div>
                                                )}

                                                {parsedImages.length > 0 && (
                                                    <div className="grid grid-cols-2 gap-2 pt-1.5">
                                                        {parsedImages.map((imgUrl, imgIdx) => (
                                                            <button
                                                                key={imgIdx}
                                                                type="button"
                                                                onClick={() => openLightbox(imgIdx)}
                                                                className="relative group overflow-hidden rounded-lg border border-slate-300 aspect-4/3 cursor-pointer shadow-xs"
                                                            >
                                                                <img
                                                                    src={imgUrl}
                                                                    alt="Chat attachment"
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                />
                                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="text-[11px] text-slate-600 font-medium text-right leading-none pt-0.5">
                                                    {formatTimeOnly(bucket.created_at)}
                                                </div>
                                            </div>
                                        </div>

                                        {bucket.summary && (
                                            <div className="flex flex-col items-end">
                                                <div className="max-w-[88%] rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-xs bg-[#DCF8C6] text-slate-950 border border-emerald-300 space-y-1">
                                                    <div className="text-xs text-emerald-950 font-black">
                                                        Jentyx Confirmation
                                                    </div>
                                                    <p className="text-sm leading-relaxed font-normal text-slate-950">
                                                        {bucket.summary}
                                                    </p>
                                                    <div className="text-[11px] text-slate-600 font-medium text-right leading-none pt-0.5">
                                                        {formatTimeOnly(bucket.updated_at || bucket.created_at)}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Voice Transcriptions Card */}
                            {parsedTranscripts.length > 0 && (
                                <div className="p-4 bg-purple-50/80 rounded-xl border border-purple-200 shadow-xs space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-950 text-xs font-bold uppercase tracking-wider">
                                            <div className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center">
                                                <Mic className="w-3 h-3 text-purple-800" />
                                            </div>
                                            <span>Voice Transcription</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(parsedTranscripts.join('\n\n'));
                                                setCopiedTranscript(true);
                                                setTimeout(() => setCopiedTranscript(false), 2000);
                                            }}
                                            className="inline-flex items-center gap-1 text-xs font-semibold text-purple-800 hover:text-purple-950 bg-purple-100 hover:bg-purple-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
                                            title="Copy full transcript"
                                        >
                                            {copiedTranscript ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span className="text-emerald-700 font-bold">Copied!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3.5 h-3.5" />
                                                    <span>Copy</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {parsedTranscripts.map((t, idx) => (
                                            <div key={idx} className="p-3 bg-white rounded-lg border border-purple-200/80 shadow-2xs">
                                                <p className="text-sm text-slate-900 leading-relaxed font-normal">
                                                    "{t}"
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: Structured Data & Media Gallery */}
                    {activeTab === 'data' && (
                        <div className="space-y-2.5">
                            {/* Top Row: Media Slider (Left) + AI Work Summary (Right) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                
                                {/* Left: Media Slider Card */}
                                <div className="card p-2 bg-white border-2 border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <div className="flex items-center gap-1 text-[11px] font-black text-slate-900 uppercase tracking-wider">
                                            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>Media</span>
                                            {allMedia.length > 0 && (
                                                <span className="text-[10px] text-slate-500 font-bold">
                                                    ({mediaSliderIndex + 1}/{allMedia.length})
                                                </span>
                                            )}
                                        </div>
                                        {allMedia.length > 0 && allMedia[mediaSliderIndex]?.type === 'image' && (
                                            <button
                                                type="button"
                                                onClick={() => openLightbox(allMedia[mediaSliderIndex].imageIndex || 0)}
                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded transition-colors cursor-pointer shadow-2xs"
                                                title="Pop / Expand Fullscreen"
                                            >
                                                <Maximize2 className="w-3 h-3" />
                                                Pop
                                            </button>
                                        )}
                                    </div>

                                    {/* Slider View */}
                                    {allMedia.length > 0 ? (
                                        <div className="relative rounded-md overflow-hidden border border-slate-200 bg-slate-900 h-28 flex items-center justify-center group">
                                            {allMedia[mediaSliderIndex]?.type === 'image' ? (
                                                <div 
                                                    onClick={() => openLightbox(allMedia[mediaSliderIndex].imageIndex || 0)}
                                                    className="w-full h-full relative cursor-pointer"
                                                >
                                                    <img
                                                        src={allMedia[mediaSliderIndex].url}
                                                        alt={`Evidence ${mediaSliderIndex + 1}`}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 flex items-center justify-center transition-colors">
                                                        <span className="opacity-0 group-hover:opacity-100 bg-black/85 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                                            <Maximize2 className="w-3 h-3" />
                                                            Expand
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Audio in slider */
                                                <div className="w-full h-full p-2 bg-gradient-to-br from-indigo-950 to-slate-900 flex flex-col justify-center items-center text-center">
                                                    <Volume2 className="w-4 h-4 text-indigo-400 mb-1" />
                                                    <span className="text-[10px] font-bold text-indigo-200 mb-1">
                                                        Voice Recording {(allMedia[mediaSliderIndex].audioIndex || 0) + 1}
                                                    </span>
                                                    <AudioPlayerChip 
                                                        src={allMedia[mediaSliderIndex].url} 
                                                        label={`Recording ${(allMedia[mediaSliderIndex].audioIndex || 0) + 1}`}
                                                        className="bg-white/95 text-[11px]"
                                                    />
                                                </div>
                                            )}

                                            {/* Slider Navigation Arrows */}
                                            {allMedia.length > 1 && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMediaSliderIndex(prev => (prev - 1 + allMedia.length) % allMedia.length);
                                                        }}
                                                        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/70 hover:bg-black/90 text-white transition-colors cursor-pointer z-10"
                                                        title="Previous Media"
                                                    >
                                                        <ChevronLeft className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMediaSliderIndex(prev => (prev + 1) % allMedia.length);
                                                        }}
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/70 hover:bg-black/90 text-white transition-colors cursor-pointer z-10"
                                                        title="Next Media"
                                                    >
                                                        <ChevronRight className="w-3 h-3" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="rounded-md border-2 border-dashed border-slate-300 bg-slate-50 h-28 flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                                            <ImageIcon className="w-5 h-5 mb-1 text-slate-400" />
                                            <span className="text-[11px] font-semibold">No media</span>
                                        </div>
                                    )}
                                </div>

                                {/* Right: User Text & AI Analysis Card */}
                                <div className="card p-2.5 bg-white border-2 border-indigo-200/90 shadow-2xs flex flex-col justify-between h-auto space-y-1.5">
                                    <div className="space-y-2">
                                        {/* 1. User Entered Raw Text */}
                                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                            <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold uppercase tracking-wider mb-1">
                                                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                                                <span>User Entered Text</span>
                                            </div>
                                            <p className="text-sm text-slate-900 font-normal leading-relaxed">
                                                "{bucket.raw_text || 'No raw text provided'}"
                                            </p>
                                        </div>

                                        {/* 2. AI Work Summary */}
                                        <div className="bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-200">
                                            <div className="flex items-center justify-between gap-1 mb-1">
                                                <div className="flex items-center gap-1 text-indigo-950 text-xs font-bold uppercase tracking-wider">
                                                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                                    <span>AI Scope Summary</span>
                                                </div>
                                                {bucket.clarity_score !== null && bucket.clarity_score !== undefined && (
                                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                                                        {Math.round(bucket.clarity_score * 100)}% Match
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-indigo-950 font-semibold leading-relaxed">
                                                {bucket.summary || 'Awaiting classification'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Scope & Project Tags */}
                                    <div className="pt-1 border-t border-slate-100 flex items-center gap-1 flex-wrap">
                                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300 truncate max-w-[140px]">
                                            {bucket.project_name || 'General Work'}
                                        </span>
                                        {bucket.potential_change && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                                Flagged Scope
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Metadata & Financials Card (Compact Matrix) */}
                            <div className="card p-2.5 bg-white border-2 border-slate-200 shadow-xs space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-slate-900 text-[11px] font-black uppercase tracking-wider">
                                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                        Job & Financial Breakdown
                                    </div>
                                </div>

                                {/* Row 1: 4 Job Metadata Pills */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                                    {/* Project */}
                                    <div className="p-1.5 bg-slate-50 rounded-md border border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block leading-none mb-1">Project</span>
                                        <span className="font-black text-slate-950 truncate block text-xs" title={bucket.project_name || 'Unassigned'}>
                                            {bucket.project_name || 'Unassigned'}
                                        </span>
                                    </div>

                                    {/* Worker */}
                                    <div className="p-1.5 bg-slate-50 rounded-md border border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block leading-none mb-1">Worker</span>
                                        <div className="flex items-center gap-1 font-black text-slate-950 truncate text-xs">
                                            <User className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                            <span className="truncate">{bucket.member_name || bucket.member_phone || 'Unknown'}</span>
                                        </div>
                                    </div>

                                    {/* Logged Hours */}
                                    <div className="p-1.5 bg-indigo-50/70 rounded-md border border-indigo-200">
                                        <span className="text-[9px] font-bold text-indigo-800 uppercase tracking-wider block leading-none mb-1">Logged Hours</span>
                                        {onUpdateHours ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    value={bucket.hours || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                        onUpdateHours(val);
                                                    }}
                                                    className="w-14 px-1 py-0 text-xs font-black border border-indigo-300 rounded bg-white text-indigo-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                    placeholder="0"
                                                />
                                                <span className="text-indigo-900 font-bold text-[10px]">hrs</span>
                                            </div>
                                        ) : (
                                            <span className="font-black text-indigo-950 text-xs">
                                                {bucket.hours !== null ? `${bucket.hours} hrs` : '-'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Audit Integrity */}
                                    <div className="p-1.5 bg-slate-50 rounded-md border border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block leading-none mb-1">Integrity</span>
                                        <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] border leading-tight ${integrity.color}`}>
                                            {integrity.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Row 2: 3 Financial Metrics */}
                                <div className="pt-1.5 border-t border-slate-200 grid grid-cols-3 gap-1.5 text-center">
                                    <div className="p-1.5 bg-slate-100 rounded-md border border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider block leading-none mb-0.5">
                                            Rate {bucket.worker_role ? `(${bucket.worker_role})` : ''}
                                        </span>
                                        <span className="text-xs font-black text-slate-900">${rate}/hr</span>
                                    </div>
                                    <div className="p-1.5 bg-indigo-50 rounded-md border border-indigo-200">
                                        <span className="text-[9px] font-bold text-indigo-800 uppercase tracking-wider block leading-none mb-0.5">Labor Cost</span>
                                        <span className="text-xs font-black text-indigo-950">
                                            ${laborCost.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="p-1.5 bg-emerald-50 border-2 border-emerald-300 rounded-md">
                                        <span className="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wider block leading-none mb-0.5">Billable Total</span>
                                        <span className="text-xs sm:text-sm font-black text-emerald-950">
                                            ${billableTotal.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Fullscreen Lightbox Modal */}
            <ImageLightbox
                images={parsedImages}
                currentIndex={lightboxIndex}
                isOpen={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                onIndexChange={setLightboxIndex}
            />
        </>
    );
}
