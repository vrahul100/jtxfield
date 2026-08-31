import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { FileText, Download } from 'lucide-react';

interface COPacket {
    id: number;
    title: string;
    status: string;
    gc_contact: string | null;
    pdf_url: string | null;
    created_at: string;
}

export function COPackets() {
    const [packets, setPackets] = useState<COPacket[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        fetchPackets();
    }, []);

    const fetchPackets = async () => {
        try {
            const res = await fetch('/api/copackets');
            if (res.ok) {
                const data = await res.json();
                setPackets(data.packets || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const generatePdf = async (id: number) => {
        try {
            const res = await fetch(`/api/copackets/${id}/generate`, { method: 'POST' });
            if (res.ok) {
                fetchPackets();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const filteredPackets = statusFilter === 'all' 
        ? packets 
        : packets.filter(p => p.status === statusFilter);

    if (loading) return <Layout><div className="p-8 text-center">Loading...</div></Layout>;

    return (
        <Layout>
            <div className="relative">
                <div className="sticky top-0 z-10 bg-slate-100 pt-2 pb-2 mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-3xl font-bold text-gray-900">Change Order Packets</h1>
                        <button onClick={fetchPackets} className="btn-secondary btn-sm">Refresh</button>
                    </div>

                    <div className="mb-0 flex gap-2 border-b border-gray-200 overflow-x-auto">
                        {['all', 'draft', 'submitted', 'approved', 'rejected', 'paid'].map(status => (
                            <button
                                key={status}
                                className={`px-4 py-2 border-b-2 capitalize text-sm cursor-pointer ${
                                    statusFilter === status 
                                    ? 'tab-nav-active' 
                                    : 'tab-nav-inactive'
                                }`}
                                onClick={() => setStatusFilter(status)}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPackets.map(packet => (
                    <div key={packet.id} className="card p-6 border border-gray-200">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-lg text-gray-900">{packet.title}</h3>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                packet.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                packet.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                                packet.status === 'approved' ? 'bg-green-100 text-green-800' :
                                'bg-yellow-100 text-yellow-800'
                            }`}>
                                {packet.status.toUpperCase()}
                            </span>
                        </div>
                        <div className="text-sm text-gray-500 mb-4 space-y-1">
                            <p>Created: {new Date(packet.created_at).toLocaleDateString()}</p>
                            {packet.gc_contact && <p>GC Contact: {packet.gc_contact}</p>}
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex gap-2">
                            {packet.pdf_url ? (
                                <a href={packet.pdf_url} target="_blank" rel="noreferrer" className="btn-primary flex-1 btn-sm">
                                    <Download className="w-4 h-4" /> Download PDF
                                </a>
                            ) : (
                                <button onClick={() => generatePdf(packet.id)} className="btn-secondary flex-1 btn-sm">
                                    <FileText className="w-4 h-4" /> Generate PDF
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {filteredPackets.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        No packets found in this status.
                    </div>
                )}
            </div>
            </div>
        </Layout>
    );
}
