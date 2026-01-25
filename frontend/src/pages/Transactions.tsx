import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { EditModal, EditField } from '../components/EditModal';
import { TransactionCard } from '../components/TransactionCard';
import { SquareChevronRight, SquareChevronLeft } from 'lucide-react';

interface Transaction {
    id: number;
    bucket_id: number;
    company_id: number;
    user_id: number;
    project_id: number | null;
    job: string | null;
    time: number | null;
    labor: string | null;
    material: string | null;
    evidence: string | null;
    scope_description: string | null;
    status: string;
    ai_summary: string | null;
    potential_change: boolean | null;
    created_at: string;
    member_name: string | null;
    member_phone: string | null;
    project_name: string | null;
    node_name: string | null;
}

interface Project {
    id: number;
    name: string;
}

export function Transactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState('');
    const [projectFilter, setProjectFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [changeFilter, setChangeFilter] = useState('all');

    useEffect(() => {
        fetchProjects();
        fetchTransactions(true);
    }, []);

    useEffect(() => {
        setPage(1); // Reset to page 1 when filters change
    }, [statusFilter, projectFilter, search, changeFilter]);

    useEffect(() => {
        fetchTransactions();
    }, [statusFilter, projectFilter, search, changeFilter, page]);

    const fetchProjects = async () => {
        try {
            const response = await fetch('/api/projects?limit=100', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                setProjects(data.projects || []);
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
        }
    };

    const fetchTransactions = async (isInitialLoad = false) => {
        if (isInitialLoad) setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (projectFilter !== 'all') params.append('projectId', projectFilter);
            if (changeFilter !== 'all') params.append('potentialChange', changeFilter);
            params.append('page', page.toString());
            params.append('limit', '10');
            if (search.trim()) params.append('search', search.trim());

            const response = await fetch(`/api/transactions?${params.toString()}`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                setTransactions(data.transactions || []);
                setTotalPages(data.totalPages || 1);
                setTotal(data.total || 0);
            }
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
        } finally {
            if (isInitialLoad) setLoading(false);
        }
    };

    const toggleExpand = (id: number) => {
        // Accordion behavior: only one card open at a time
        setExpandedIds(prev => {
            const newSet = new Set<number>();
            if (!prev.has(id)) {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleEdit = (txn: Transaction) => {
        setEditingTransaction(txn);
    };

    const handleSave = async (values: Record<string, any>) => {
        if (!editingTransaction) return;

        const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                labor: values.labor,
                material: values.material,
                projectId: values.projectId ? Number(values.projectId) : null,
                time: values.time ? Number(values.time) : null,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Update failed:', response.status, errorData);
            throw new Error(`Failed to update: ${errorData.error || response.statusText}`);
        }

        await fetchTransactions();
    };

    const getEditFields = (): EditField[] => {
        if (!editingTransaction) return [];

        return [
            {
                name: 'time',
                label: 'Time (hours)',
                type: 'number',
                value: editingTransaction.time,
            },
            {
                name: 'labor',
                label: 'Labor Description',
                type: 'textarea',
                value: editingTransaction.labor,
                rows: 3,
            },
            {
                name: 'material',
                label: 'Materials',
                type: 'textarea',
                value: editingTransaction.material,
                rows: 3,
            },
            {
                name: 'projectId',
                label: 'Project',
                type: 'select',
                value: editingTransaction.project_id,
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
                    <h1 className="text-3xl font-bold text-gray-900">Timesheets</h1>
                    <button onClick={() => fetchTransactions(true)} className="btn-primary">
                        Refresh
                    </button>
                </div>


                {/* Search and Filters */}
                <div className="card p-4 mb-6">
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Search by member, project, or job..."
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
                                <option value="COMPLETED">Completed</option>
                                <option value="PENDING">Pending</option>
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

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                    {transactions.map((txn) => (
                        <TransactionCard
                            key={txn.id}
                            transaction={txn}
                            isExpanded={expandedIds.has(txn.id)}
                            onToggleExpand={() => toggleExpand(txn.id)}
                            onEdit={() => handleEdit(txn)}
                        />
                    ))}
                </div>

                {transactions.length === 0 && (
                    <div className="card p-8 text-center text-gray-500">
                        <p className="text-lg">No timesheets found.</p>
                        <p className="text-sm mt-2">Try adjusting your filters or search query.</p>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-6">
                        <span className="text-sm text-gray-600">
                            Showing {transactions.length} of {total} transactions
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
                            <span className="px-3 py-1 text-sm">Page {page} of {totalPages}</span>
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
                isOpen={!!editingTransaction}
                title={`Edit Work Log #${editingTransaction?.id}`}
                fields={getEditFields()}
                onSave={handleSave}
                onClose={() => setEditingTransaction(null)}
            />
        </Layout>
    );
}
