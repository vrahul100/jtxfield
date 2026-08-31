import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Settings2, ArrowRight, CheckCircle2 } from 'lucide-react';

const INTEGRATIONS = [
    { id: 'procore', name: 'Procore', desc: 'Sync timesheets, photos, and daily logs directly to Procore.', icon: '🏗️' },
    { id: 'samsara', name: 'Samsara', desc: 'Fleet tracking and equipment hours integrated with Jentyx.', icon: '🚚' },
    { id: 'quickbooks', name: 'QuickBooks', desc: 'Push approved hours and billable values to QuickBooks Payroll.', icon: '💼' }
];

export function Integrations() {
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState<string[]>([]);

    const handleInterest = async (id: string, name: string) => {
        setSubmitting(id);
        try {
            const res = await fetch('/api/integrations/interest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ integrationName: name })
            });
            if (res.ok) {
                setSubmitted(prev => [...prev, id]);
            } else {
                alert('Failed to register interest');
            }
        } catch (e) {
            alert('Error registering interest');
        } finally {
            setSubmitting(null);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <Settings2 className="w-8 h-8 text-sky-600" />
                        Integrations
                    </h1>
                    <p className="text-gray-500">Connect Jentyx with your existing tools. Let us know which connections you need first!</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {INTEGRATIONS.map(int => (
                        <div key={int.id} className="card p-6 border-2 border-transparent hover:border-sky-100 transition-colors">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    {int.icon}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{int.name}</h3>
                                    <p className="text-gray-600 mb-6">{int.desc}</p>
                                    
                                    {submitted.includes(int.id) ? (
                                        <div className="flex items-center gap-2 text-green-600 font-medium">
                                            <CheckCircle2 className="w-5 h-5" />
                                            Interest Registered!
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleInterest(int.id, int.name)}
                                            disabled={submitting === int.id}
                                            className="group flex items-center gap-2 text-sky-600 font-medium hover:text-sky-800 transition-colors"
                                        >
                                            {submitting === int.id ? 'Registering...' : 'Request Early Access'}
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Layout>
    );
}
