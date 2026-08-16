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
    Volume2
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
        switch (status) {
            case 'open':
                return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case 'submitted':
                return 'bg-emerald-500 text-white border-emerald-500 font-bold';
            case 'pending_review':
                return 'bg-amber-100 text-amber-800 border-amber-300';
            case 'rejected':
                return 'bg-rose-100 text-rose-800 border-rose-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
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
            return { label: 'Verified', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
        }
        const sent = new Date(bucket.wa_sent_timestamp).getTime();
        const received = new Date(bucket.wa_received_timestamp).getTime();
        const diffHours = Math.abs(received - sent) / (1000 * 60 * 60);

        if (diffHours > 24) return { label: 'Delayed (>24h)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
        if (diffHours > 4) return { label: 'Delayed (>4h)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
        return { label: 'Verified', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    };

    const openLightbox = (index: number) => {
        setLightboxIndex(index);
        setLightboxOpen(true);
    };

    const showReviewActions = ['pending_review', 'processing', 'open', 'flagged'].includes(bucket.status);
    const integrity = getTimeIntegrity();
    const rate = bucket.node_rate || 85;
    const hours = bucket.hours || 0;
    const laborCost = hours * rate;
    const billableTotal = laborCost * 1.2;

    return (
        <>
            {/* Drawer Container (Side Panel) */}
            <div className="w-full lg:w-[540px] xl:w-[600px] flex-shrink-0 flex flex-col h-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden transition-all animate-in slide-in-from-right duration-200 z-10">
                
                {/* 1. Drawer Header */}
                <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex-shrink-0 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-base">
                                {formatTicketCode(bucket.node_name, bucket.id)}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getStatusColor(bucket.status)}`}>
                                {bucket.status?.replace('_', ' ').toUpperCase()}
                            </span>
                            {bucket.potential_change && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    Flagged CO
                                </span>
                            )}
                        </div>

                        <button
                            onClick={onClose}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                            title="Close Drawer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Quick Action Toolbar */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {showReviewActions && (
                                <>
                                    <button
                                        onClick={onSubmit}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors"
                                        title="Approve & Submit Transaction"
                                    >
                                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                        Submit CO
                                    </button>
                                    <button
                                        onClick={onReject}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-md text-xs font-semibold transition-colors"
                                        title="Reject Ticket"
                                    >
                                        <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                        Reject
                                    </button>
                                </>
                            )}

                            <button
                                onClick={onToggleChange}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                                    bucket.potential_change
                                        ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                                title={bucket.potential_change ? 'Remove Potential Change Flag' : 'Flag as Potential Change Order'}
                            >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                {bucket.potential_change ? 'Unflag' : 'Flag CO'}
                            </button>

                            <button
                                onClick={onEdit}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md text-xs font-semibold transition-colors"
                                title="Edit Project & Classification"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                            </button>
                        </div>

                        <span className="text-[11px] text-slate-400 font-medium">
                            {formatDate(bucket.created_at)}
                        </span>
                    </div>
                </div>

                {/* 2. Drawer Tab Switcher */}
                <div className="flex border-b border-slate-200 bg-slate-100/70 px-4 pt-1.5 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-all ${
                            activeTab === 'whatsapp'
                                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-md shadow-2xs'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        WhatsApp Context
                        {(parsedAudio.length > 0 || parsedImages.length > 0) && (
                            <span className="ml-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[10px]">
                                {parsedAudio.length + parsedImages.length}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('data')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-all ${
                            activeTab === 'data'
                                ? 'border-indigo-600 text-indigo-800 bg-white rounded-t-md shadow-2xs'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        Data & Evidence
                    </button>
                </div>

                {/* 3. Drawer Scrollable Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/50 space-y-4">
                    
                    {/* TAB 1: WhatsApp Thread */}
                    {activeTab === 'whatsapp' && (
                        <div className="space-y-3">
                            {/* WhatsApp Chat Canvas */}
                            <div 
                                className="rounded-xl border border-slate-300 p-3 sm:p-4 space-y-3 min-h-[320px] max-h-[500px] overflow-y-auto shadow-inner"
                                style={{
                                    backgroundColor: '#ECE5DD',
                                    backgroundImage: 'radial-gradient(#d3c9be 0.75px, transparent 0.75px)',
                                    backgroundSize: '12px 12px'
                                }}
                            >
                                <div className="text-center">
                                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/75 text-[10px] font-semibold text-slate-600 shadow-2xs">
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
                                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-xs space-y-1.5 ${
                                                        isUser
                                                            ? 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/70'
                                                            : 'bg-[#DCF8C6] text-slate-900 rounded-tr-xs border border-emerald-200/70'
                                                    }`}
                                                >
                                                    {/* Sender tag */}
                                                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 font-medium">
                                                        <span>{isUser ? (bucket.member_name || bucket.member_phone || 'Worker') : 'Jentyx Assistant'}</span>
                                                    </div>

                                                    <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                                                        {msg.content}
                                                    </p>

                                                    {/* If first user message, attach audio and image chips inside bubble */}
                                                    {isUser && i === 0 && (
                                                        <>
                                                            {parsedAudio.length > 0 && (
                                                                <div className="pt-1 space-y-1">
                                                                    {parsedAudio.map((audioUrl, aIdx) => (
                                                                        <AudioPlayerChip key={aIdx} src={audioUrl} label={`Voice Note ${aIdx + 1}`} />
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {parsedImages.length > 0 && (
                                                                <div className="grid grid-cols-2 gap-1.5 pt-1">
                                                                    {parsedImages.map((imgUrl, imgIdx) => (
                                                                        <button
                                                                            key={imgIdx}
                                                                            type="button"
                                                                            onClick={() => openLightbox(imgIdx)}
                                                                            className="relative group overflow-hidden rounded-lg border border-slate-200 aspect-4/3"
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
                                                        <div className="text-[10px] text-slate-400 text-right leading-none pt-0.5">
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
                                            <div className="max-w-[85%] rounded-2xl rounded-tl-xs px-3 py-2 text-xs shadow-xs bg-white text-slate-900 border border-slate-200/70 space-y-1.5">
                                                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 font-medium">
                                                    <span>{bucket.member_name || bucket.member_phone || 'Worker'}</span>
                                                </div>

                                                <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                                                    {bucket.raw_text || '(No text content)'}
                                                </p>

                                                {parsedAudio.length > 0 && (
                                                    <div className="pt-1 space-y-1">
                                                        {parsedAudio.map((audioUrl, aIdx) => (
                                                            <AudioPlayerChip key={aIdx} src={audioUrl} label={`Voice Note ${aIdx + 1}`} />
                                                        ))}
                                                    </div>
                                                )}

                                                {parsedImages.length > 0 && (
                                                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                                                        {parsedImages.map((imgUrl, imgIdx) => (
                                                            <button
                                                                key={imgIdx}
                                                                type="button"
                                                                onClick={() => openLightbox(imgIdx)}
                                                                className="relative group overflow-hidden rounded-lg border border-slate-200 aspect-4/3"
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

                                                <div className="text-[10px] text-slate-400 text-right leading-none pt-0.5">
                                                    {formatTimeOnly(bucket.created_at)}
                                                </div>
                                            </div>
                                        </div>

                                        {bucket.summary && (
                                            <div className="flex flex-col items-end">
                                                <div className="max-w-[85%] rounded-2xl rounded-tr-xs px-3 py-2 text-xs shadow-xs bg-[#DCF8C6] text-slate-900 border border-emerald-200/70 space-y-1">
                                                    <div className="text-[10px] text-emerald-800 font-medium">
                                                        Jentyx Confirmation
                                                    </div>
                                                    <p className="text-[13px] leading-relaxed">
                                                        {bucket.summary}
                                                    </p>
                                                    <div className="text-[10px] text-slate-400 text-right leading-none pt-0.5">
                                                        {formatTimeOnly(bucket.updated_at || bucket.created_at)}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Voice Transcriptions Callout if present */}
                            {parsedTranscripts.length > 0 && (
                                <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200/80">
                                    <div className="flex items-center gap-1.5 text-purple-900 text-xs font-bold mb-1">
                                        <Mic className="w-3.5 h-3.5 text-purple-600" />
                                        Voice Transcript
                                    </div>
                                    <div className="space-y-1">
                                        {parsedTranscripts.map((t, idx) => (
                                            <p key={idx} className="text-xs text-purple-950 italic">
                                                "{t}"
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: Structured Data & Media Gallery */}
                    {activeTab === 'data' && (
                        <div className="space-y-3">
                            {/* Top Row: Media Slider (Left) + AI Work Summary (Right) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                
                                {/* Left: Media Slider Card */}
                                <div className="card p-2.5 bg-white border border-slate-200 shadow-2xs flex flex-col justify-between overflow-hidden">
                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>Media Evidence</span>
                                            {allMedia.length > 0 && (
                                                <span className="text-[10px] text-slate-400 font-normal">
                                                    ({mediaSliderIndex + 1}/{allMedia.length})
                                                </span>
                                            )}
                                        </div>
                                        {allMedia.length > 0 && allMedia[mediaSliderIndex]?.type === 'image' && (
                                            <button
                                                type="button"
                                                onClick={() => openLightbox(allMedia[mediaSliderIndex].imageIndex || 0)}
                                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                                title="Pop / Expand Fullscreen"
                                            >
                                                <Maximize2 className="w-3 h-3" />
                                                Pop
                                            </button>
                                        )}
                                    </div>

                                    {/* Slider View */}
                                    {allMedia.length > 0 ? (
                                        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 aspect-4/3 flex items-center justify-center group">
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
                                                        <span className="opacity-0 group-hover:opacity-100 bg-black/75 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                                            <Maximize2 className="w-3 h-3" />
                                                            Click to Expand
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Audio in slider */
                                                <div className="w-full h-full p-2.5 bg-gradient-to-br from-indigo-950 to-slate-900 flex flex-col justify-center items-center text-center">
                                                    <Volume2 className="w-5 h-5 text-indigo-400 mb-1.5" />
                                                    <span className="text-[10px] font-medium text-indigo-200 mb-2">
                                                        Voice Recording {(allMedia[mediaSliderIndex].audioIndex || 0) + 1}
                                                    </span>
                                                    <AudioPlayerChip 
                                                        src={allMedia[mediaSliderIndex].url} 
                                                        label={`Recording ${(allMedia[mediaSliderIndex].audioIndex || 0) + 1}`}
                                                        className="bg-white/95"
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
                                                        className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer z-10"
                                                        title="Previous Media"
                                                    >
                                                        <ChevronLeft className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMediaSliderIndex(prev => (prev + 1) % allMedia.length);
                                                        }}
                                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer z-10"
                                                        title="Next Media"
                                                    >
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 aspect-4/3 flex flex-col items-center justify-center text-slate-400 p-3 text-center">
                                            <ImageIcon className="w-6 h-6 mb-1 text-slate-300" />
                                            <span className="text-[11px]">No media attached</span>
                                        </div>
                                    )}
                                </div>

                                {/* Right: AI Work Summary Card */}
                                <div className="card p-3 bg-gradient-to-br from-indigo-50/70 to-purple-50/40 border-indigo-100 shadow-2xs flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between gap-1 mb-1.5">
                                            <div className="flex items-center gap-1.5 text-indigo-900 text-xs font-bold">
                                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                                AI Work Summary
                                            </div>
                                            {bucket.clarity_score !== null && bucket.clarity_score !== undefined && (
                                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                                                    {Math.round(bucket.clarity_score * 100)}% Match
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-indigo-950 leading-relaxed font-medium">
                                            {bucket.summary || bucket.raw_text || 'No summary available.'}
                                        </p>
                                    </div>

                                    <div className="pt-2 mt-2 border-t border-indigo-100/70 flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white text-indigo-700 border border-indigo-200/80">
                                            {bucket.project_name || 'General Work'}
                                        </span>
                                        {bucket.potential_change && (
                                            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                                Flagged Scope
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Metadata & Financials Card */}
                            <div className="card p-3.5 bg-white space-y-3">
                                <div className="flex items-center gap-1.5 text-slate-800 text-xs font-bold uppercase tracking-wider">
                                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                    Job & Hours Breakdown
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    {/* Project */}
                                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Project</span>
                                        <span className="font-semibold text-slate-800 truncate block">
                                            {bucket.project_name || 'Unassigned'}
                                        </span>
                                    </div>

                                    {/* Worker */}
                                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Worker</span>
                                        <div className="flex items-center gap-1 font-semibold text-slate-800 truncate">
                                            <User className="w-3 h-3 text-slate-400" />
                                            <span>{bucket.member_name || bucket.member_phone || 'Unknown'}</span>
                                        </div>
                                    </div>

                                    {/* Hours Worked */}
                                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Logged Hours</span>
                                        {onUpdateHours ? (
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    value={bucket.hours || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                        onUpdateHours(val);
                                                    }}
                                                    className="w-16 px-1.5 py-0.5 text-xs font-bold border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                    placeholder="0"
                                                />
                                                <span className="text-slate-600 font-medium">hrs</span>
                                            </div>
                                        ) : (
                                            <span className="font-bold text-slate-900">
                                                {bucket.hours !== null ? `${bucket.hours} hrs` : '-'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Integrity Status */}
                                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[11px] text-slate-500 font-medium block mb-0.5">Audit Integrity</span>
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${integrity.color}`}>
                                            {integrity.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Financial Matrix */}
                                <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <span className="text-[10px] text-slate-500 block">Rate</span>
                                        <span className="text-xs font-semibold text-slate-700">${rate}/hr</span>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <span className="text-[10px] text-slate-500 block">Labor Cost</span>
                                        <span className="text-xs font-semibold text-slate-800">
                                            ${laborCost.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                        <span className="text-[10px] text-emerald-600 font-semibold block">Billable Total</span>
                                        <span className="text-xs font-bold text-emerald-700">
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
