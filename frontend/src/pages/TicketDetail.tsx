import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MapPin, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';

export function TicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [bucket, setBucket] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBucket();
    }, [id]);

    const fetchBucket = async () => {
        try {
            const res = await fetch(`/api/worklog/${id}`);
            if (res.ok) {
                const data = await res.json();
                setBucket(data.bucket);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Layout><div className="p-8 text-center">Loading...</div></Layout>;
    if (!bucket) return <Layout><div className="p-8 text-center">Ticket not found</div></Layout>;

    // Calculate labor/billable
    const nodeRate = bucket.node_rate ? parseFloat(bucket.node_rate) : 85;
    const hours = bucket.hours ? parseFloat(bucket.hours) : 0;
    const laborCents = hours * nodeRate;
    const billableCents = laborCents * 1.2;

    let messages = [];
    try {
        messages = bucket.conversation_history ? (typeof bucket.conversation_history === 'string' ? JSON.parse(bucket.conversation_history) : bucket.conversation_history) : [];
    } catch(e) {}

    let images = [];
    try {
        images = bucket.image_urls ? JSON.parse(bucket.image_urls) : [];
    } catch(e) {}

    const getTimeIntegrity = () => {
        if (!bucket.wa_sent_timestamp || !bucket.wa_received_timestamp) {
            return { status: 'verified', label: 'Verified', color: 'text-green-600', icon: CheckCircle };
        }
        const sent = new Date(bucket.wa_sent_timestamp).getTime();
        const received = new Date(bucket.wa_received_timestamp).getTime();
        const diffHours = Math.abs(received - sent) / (1000 * 60 * 60);

        if (diffHours > 24) return { status: 'red', label: 'Delayed (>24h)', color: 'text-red-600', icon: AlertTriangle };
        if (diffHours > 4) return { status: 'yellow', label: 'Delayed (>4h)', color: 'text-yellow-600', icon: AlertTriangle };
        return { status: 'verified', label: 'Verified', color: 'text-green-600', icon: CheckCircle };
    };
    
    const integrity = getTimeIntegrity();
    const IntegrityIcon = integrity.icon;

    return (
        <Layout>
            <div className="mb-6 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <h1 className="text-3xl font-bold text-gray-900">Work Ticket #{bucket.id}</h1>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-200 text-gray-800 capitalize">
                    {bucket.status}
                </span>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Main Column */}
                <div className="flex-1 space-y-6">
                    {/* Header Summary */}
                    <div className="card p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold text-xl">
                                {bucket.member_name ? bucket.member_name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{bucket.member_name || 'Unknown Worker'}</h2>
                                <p className="text-gray-500">{bucket.member_phone}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                            <div>
                                <p className="text-sm text-gray-500">Project</p>
                                <p className="font-semibold text-gray-900">{bucket.project_name || 'None'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Date</p>
                                <p className="font-semibold text-gray-900">{new Date(bucket.created_at).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Time</p>
                                <p className="font-semibold text-gray-900">{new Date(bucket.created_at).toLocaleTimeString()}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Time Integrity</p>
                                <p className={`font-semibold flex items-center gap-1 ${integrity.color}`}><IntegrityIcon className="w-4 h-4"/> {integrity.label}</p>
                            </div>
                        </div>
                    </div>

                    {/* AI Summary Block */}
                    {bucket.summary && (
                        <div className="card p-6 bg-sky-50 border-sky-100">
                            <h3 className="text-lg font-bold text-sky-900 mb-2 flex items-center gap-2">🤖 AI Summary</h3>
                            <p className="text-sky-800">{bucket.summary}</p>
                        </div>
                    )}

                    {/* Evidence Panel */}
                    <div className="card p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Evidence</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {images.map((url: string, i: number) => (
                                <img key={i} src={url} alt="Evidence" className="rounded-lg object-cover w-full h-48 border border-gray-200" />
                            ))}
                        </div>
                        {images.length === 0 && <p className="text-gray-500">No media attached.</p>}
                    </div>

                    {/* Conversation Thread */}
                    <div className="card p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Conversation Thread</h3>
                        <div className="space-y-4">
                            {messages.map((msg: any, i: number) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
                                        <p>{msg.content}</p>
                                        {msg.media && msg.media.length > 0 && <span className="text-xs opacity-75 mt-1 block">📎 {msg.media.length} attachments</span>}
                                    </div>
                                </div>
                            ))}
                            {messages.length === 0 && <p className="text-gray-500">No conversation history available.</p>}
                        </div>
                    </div>

                    {/* Mapbox */}
                    <div className="card p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Location</h3>
                        <div className="bg-gray-100 h-64 rounded-lg flex items-center justify-center border border-gray-200 relative overflow-hidden">
                            {bucket.latitude && bucket.longitude ? (
                                <div className="absolute inset-0 w-full h-full">
                                    <img 
                                        src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s-l+ef4444(${bucket.longitude},${bucket.latitude})/${bucket.longitude},${bucket.latitude},14/800x400?access_token=pk.placeholder`} 
                                        alt="Map"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                    <div className="hidden absolute inset-0 flex-col items-center justify-center bg-gray-100">
                                        <MapPin className="w-8 h-8 text-red-500 mx-auto mb-2" />
                                        <p className="text-gray-900 font-mono text-sm">{bucket.latitude}, {bucket.longitude}</p>
                                        <p className="text-gray-500 text-xs mt-2">{bucket.address || 'Address pending...'}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-gray-500">No GPS location attached.</p>
                                    <p className="text-gray-400 text-xs mt-1">Stated: {bucket.location || 'None'}</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Sidebar Column */}
                <div className="w-full lg:w-96 space-y-6">
                    {/* Status & Actions */}
                    <div className="card p-6">
                        <h3 className="font-bold text-gray-900 mb-4">Actions</h3>
                        <div className="space-y-2">
                            <button className="btn-primary w-full">Approve Ticket</button>
                            <button className="btn-danger-outline w-full">Reject Ticket</button>
                            <button className="btn-secondary w-full">Flag for Review</button>
                        </div>
                    </div>

                    {/* Scope & Materials */}
                    <div className="card p-6">
                        <h3 className="font-bold text-gray-900 mb-4">Scope & Materials</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Scope</label>
                                <textarea className="input-field w-full" rows={3} defaultValue={bucket.summary || ''} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Materials</label>
                                <textarea className="input-field w-full" rows={2} defaultValue={bucket.material || 'None reported'} />
                            </div>
                        </div>
                    </div>

                    {/* Hours & Labor */}
                    <div className="card p-6">
                        <h3 className="font-bold text-gray-900 mb-4">Financials</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Hours</label>
                                <input type="number" step="0.5" className="input-field w-full" defaultValue={bucket.hours || ''} />
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="text-gray-600">Labor Rate</span>
                                <span className="font-mono text-gray-900">${nodeRate.toFixed(2)}/hr</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Labor Total</span>
                                <span className="font-mono font-bold text-gray-900">${laborCents.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="text-gray-600">Billable Markup</span>
                                <span className="font-mono text-gray-900">1.20x</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sky-600 font-medium">Billable Total</span>
                                <span className="font-mono font-bold text-sky-700">${billableCents.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </Layout>
    );
}
