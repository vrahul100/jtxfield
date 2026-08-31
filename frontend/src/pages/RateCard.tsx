import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { 
    BadgeDollarSign, 
    Plus, 
    Pencil, 
    Trash2, 
    RotateCw, 
    ShieldCheck, 
    Info, 
    Building2,
    Check
} from 'lucide-react';

interface RateCardItem {
    id: number;
    nodeId: number;
    role: string;
    hourlyRate: number;
    createdAt?: string;
    updatedAt?: string;
}

interface NodeItem {
    id: number;
    name: string;
}

export function RateCard() {
    const { user } = useAuth();
    const [rateCards, setRateCards] = useState<RateCardItem[]>([]);
    const [baseRate, setBaseRate] = useState<number>(85.00);
    const [nodeName, setNodeName] = useState<string>('');
    const [suggestedRoles, setSuggestedRoles] = useState<string[]>([]);
    const [nodes, setNodes] = useState<NodeItem[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(user?.nodeId || null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingItem, setEditingItem] = useState<RateCardItem | null>(null);

    // Form state for role rates
    const [formRole, setFormRole] = useState('');
    const [formRate, setFormRate] = useState('');
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // Base rate edit state
    const [editingBaseRate, setEditingBaseRate] = useState(false);
    const [baseRateInput, setBaseRateInput] = useState('');
    const [savingBaseRate, setSavingBaseRate] = useState(false);

    useEffect(() => {
        if (user?.role === 'SU') {
            fetchNodes();
        }
    }, [user?.role]);

    useEffect(() => {
        fetchRateCardData();
    }, [selectedNodeId]);

    const fetchNodes = async () => {
        try {
            const res = await fetch('/api/nodes', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.nodes && Array.isArray(data.nodes)) {
                    setNodes(data.nodes);
                    if (!selectedNodeId && data.nodes.length > 0) {
                        setSelectedNodeId(data.nodes[0].id);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch nodes:', err);
        }
    };

    const fetchRateCardData = async () => {
        setRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (selectedNodeId) {
                params.append('nodeId', selectedNodeId.toString());
            }

            const res = await fetch(`/api/rate-cards?${params.toString()}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setBaseRate(data.baseRate || 85.00);
                setBaseRateInput((data.baseRate || 85.00).toFixed(2));
                setNodeName(data.nodeName || '');
                setRateCards(data.rateCards || []);
                setSuggestedRoles(data.suggestedRoles || []);
            }
        } catch (err) {
            console.error('Failed to fetch rate card data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSaveBaseRate = async () => {
        const parsed = parseFloat(baseRateInput);
        if (isNaN(parsed) || parsed <= 0) {
            alert('Please enter a valid base rate greater than $0.');
            return;
        }

        setSavingBaseRate(true);
        try {
            const res = await fetch('/api/rate-cards/base-rate', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    baseRate: parsed,
                    nodeId: selectedNodeId
                })
            });

            if (res.ok) {
                setBaseRate(parsed);
                setEditingBaseRate(false);
                fetchRateCardData();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to update base rate');
            }
        } catch (err) {
            console.error('Error updating base rate:', err);
            alert('Failed to update base rate');
        } finally {
            setSavingBaseRate(false);
        }
    };

    const handleOpenAddModal = () => {
        setEditingItem(null);
        setFormRole('');
        setFormRate('');
        setFormError('');
        setShowAddModal(true);
    };

    const handleOpenEditModal = (item: RateCardItem) => {
        setEditingItem(item);
        setFormRole(item.role);
        setFormRate(item.hourlyRate.toFixed(2));
        setFormError('');
        setShowAddModal(true);
    };

    const handleSaveRoleRate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        const role = formRole.trim();
        const rate = parseFloat(formRate);

        if (!role) {
            setFormError('Role name is required');
            return;
        }

        if (isNaN(rate) || rate <= 0) {
            setFormError('Hourly rate must be a valid number greater than 0');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/rate-cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    role,
                    hourlyRate: rate,
                    nodeId: selectedNodeId
                })
            });

            if (res.ok) {
                setShowAddModal(false);
                fetchRateCardData();
            } else {
                const data = await res.json();
                setFormError(data.error || 'Failed to save role rate');
            }
        } catch (err) {
            console.error('Failed to save role rate:', err);
            setFormError('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRoleRate = async (id: number, roleName: string) => {
        if (!confirm(`Remove "${roleName}" from the rate card? Workers with this role will revert to the base rate ($${baseRate.toFixed(2)}/hr).`)) {
            return;
        }

        try {
            const res = await fetch(`/api/rate-cards/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (res.ok) {
                fetchRateCardData();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete role rate');
            }
        } catch (err) {
            console.error('Failed to delete role rate:', err);
            alert('Failed to delete role rate');
        }
    };

    const presetRoleSuggestions = [
        'Foreman',
        'Journeyman',
        'Apprentice',
        'General Labor',
        'Equipment Operator',
        'Carpenter',
        'Electrician',
        'Plumber',
        'Welder',
        'Helper'
    ];

    const combinedSuggestions = Array.from(new Set([...suggestedRoles, ...presetRoleSuggestions]));

    if (loading) {
        return (
            <Layout>
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-slate-500 font-medium">
                        <RotateCw className="w-5 h-5 animate-spin text-sky-600" />
                        <span>Loading Rate Card...</span>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6 max-w-6xl w-full mx-auto">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
                                <BadgeDollarSign className="w-5 h-5" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rate Card</h1>
                                <p className="text-xs text-slate-500">
                                    Set standard hourly billing rates per worker role for {nodeName ? <span className="font-semibold text-slate-700">{nodeName}</span> : 'your company'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        {user?.role === 'SU' && nodes.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-slate-400" />
                                <select
                                    value={selectedNodeId || ''}
                                    onChange={(e) => setSelectedNodeId(parseInt(e.target.value))}
                                    className="input-field text-xs h-9 py-1"
                                >
                                    {nodes.map(n => (
                                        <option key={n.id} value={n.id}>{n.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            onClick={fetchRateCardData}
                            disabled={refreshing}
                            className="btn-secondary btn-sm"
                            title="Refresh rate card"
                        >
                            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>

                        <button
                            onClick={handleOpenAddModal}
                            className="btn-primary btn-sm shadow-xs"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Role Rate</span>
                        </button>
                    </div>
                </div>

                {/* Top Banner: Default Base Rate Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1 card p-5 bg-gradient-to-br from-sky-950 to-slate-900 text-white rounded-xl shadow-md flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
                        
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                                    Default Base Rate
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-sky-500/30 text-sky-200 text-[10px] font-semibold border border-sky-400/30">
                                    Global Fallback
                                </span>
                            </div>

                            {editingBaseRate ? (
                                <div className="space-y-2 mt-2">
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={baseRateInput}
                                            onChange={(e) => setBaseRateInput(e.target.value)}
                                            className="w-full bg-slate-800 border border-sky-400 rounded-lg pl-7 pr-3 py-1.5 text-lg font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                                            placeholder="85.00"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSaveBaseRate}
                                            disabled={savingBaseRate}
                                            className="px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                                        >
                                            <Check className="w-3 h-3" />
                                            {savingBaseRate ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setEditingBaseRate(false); setBaseRateInput(baseRate.toFixed(2)); }}
                                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-md transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-1 flex items-baseline gap-2">
                                    <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                        ${baseRate.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-sky-300 font-medium">/ hour</span>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-sky-800/60 mt-4 flex items-center justify-between">
                            <p className="text-[11px] text-sky-200 leading-snug max-w-[200px]">
                                Applied to any worker who does not have an explicit role rate below.
                            </p>
                            {!editingBaseRate && (
                                <button
                                    onClick={() => setEditingBaseRate(true)}
                                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                                    title="Edit Base Rate"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* How It Works Card */}
                    <div className="md:col-span-2 card p-5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                                <Info className="w-4 h-4 text-sky-600" />
                                <span>How Rate Resolution Works</span>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed mb-3">
                                Rates automatically attach to incoming tickets, timesheet calculations, and change order billing based on worker role assignment:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                    <span className="font-bold text-slate-800 block mb-0.5">1. Matched Role Rate</span>
                                    <span className="text-slate-500 leading-normal">
                                        If the worker has a role matching an entry in the table below, that specific rate is applied.
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-200">
                                    <span className="font-bold text-sky-900 block mb-0.5">2. Default Base Rate</span>
                                    <span className="text-sky-700/80 leading-normal">
                                        If the worker has no role or an unlisted role, they inherit the Base Rate (${baseRate.toFixed(2)}/hr).
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span>Worker roles can be updated anytime in the <a href="/members" className="text-sky-600 font-semibold hover:underline">Members</a> tab.</span>
                        </div>
                    </div>
                </div>

                {/* Role Rates Table */}
                <div className="card bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Role-Specific Rates</h2>
                            <p className="text-xs text-slate-500">Configured hourly billing rates for {nodeName || 'Node'}</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
                            {rateCards.length} {rateCards.length === 1 ? 'Role' : 'Roles'}
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3">Role / Position</th>
                                    <th className="px-5 py-3 text-center">Hourly Rate</th>
                                    <th className="px-5 py-3 text-center">Status</th>
                                    <th className="px-5 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {rateCards.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                                            <BadgeDollarSign className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                                            <p className="font-medium text-slate-600">No role-specific rates configured yet.</p>
                                            <p className="text-xs text-slate-400 mt-0.5">All workers currently bill at the default Base Rate (${baseRate.toFixed(2)}/hr).</p>
                                            <button
                                                onClick={handleOpenAddModal}
                                                className="mt-3 btn-primary btn-xs"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                Add First Role Rate
                                            </button>
                                        </td>
                                    </tr>
                                ) : (
                                    rateCards.map((item) => (
                                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="font-semibold text-slate-900">{item.role}</div>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className="inline-flex items-center gap-0.5 font-bold text-slate-900 text-base">
                                                    ${item.hourlyRate.toFixed(2)}
                                                    <span className="text-xs font-normal text-slate-500">/hr</span>
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    Active
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditModal(item)}
                                                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-sky-600 transition-colors"
                                                        title="Edit rate"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRoleRate(item.id, item.role)}
                                                        className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                                        title="Delete rate"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add / Edit Role Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {editingItem ? `Edit Rate for ${editingItem.role}` : 'Add Role-Specific Rate'}
                                </h3>
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
                                >
                                    &times;
                                </button>
                            </div>

                            {formError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700">
                                    {formError}
                                </div>
                            )}

                            <form onSubmit={handleSaveRoleRate} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                                        Worker Role / Position Name
                                    </label>
                                    <input
                                        type="text"
                                        list="roles-datalist"
                                        value={formRole}
                                        onChange={(e) => setFormRole(e.target.value)}
                                        placeholder="e.g. Foreman, Journeyman, Apprentice"
                                        className="input-field w-full text-sm"
                                        autoFocus
                                    />
                                    <datalist id="roles-datalist">
                                        {combinedSuggestions.map((r, idx) => (
                                            <option key={idx} value={r} />
                                        ))}
                                    </datalist>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Must match the role assigned to workers in the Members directory.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                                        Hourly Billing Rate ($ USD / hr)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formRate}
                                            onChange={(e) => setFormRate(e.target.value)}
                                            placeholder="95.00"
                                            className="input-field w-full pl-7 text-sm font-semibold"
                                        />
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="btn-secondary btn-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="btn-primary btn-sm"
                                    >
                                        {saving ? 'Saving...' : editingItem ? 'Update Rate' : 'Add Rate'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </Layout>
    );
}
