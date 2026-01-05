import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { EditModal, EditField } from '../components/EditModal';
import { Pencil, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

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

    useEffect(() => {
        fetchProjects();
        fetchTransactions(true);
    }, []);

    useEffect(() => {
        setPage(1); // Reset to page 1 when filters change
    }, [statusFilter, projectFilter, search]);

    useEffect(() => {
        fetchTransactions();
    }, [statusFilter, projectFilter, search, page]);

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

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const toggleExpand = (id: number) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
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
                    </div>
                </div>

                <div className="card overflow-hidden">
                    <table className="table-auto w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time (hrs)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labor</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {transactions.map((txn) => {
                                const isExpanded = expandedIds.has(txn.id);
                                return (
                                    <React.Fragment key={txn.id}>
                                        <tr
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => toggleExpand(txn.id)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    className="p-1 hover:bg-gray-200 rounded"
                                                >
                                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">#{txn.id}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">{formatDate(txn.created_at)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">#{txn.bucket_id}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <div>{txn.member_name || 'Unknown'}</div>
                                                {txn.member_phone && (
                                                    <div className="text-xs text-gray-500">{txn.member_phone}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm">{txn.project_name || '-'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {txn.time ? Number(txn.time).toFixed(1) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                <div className="line-clamp-2">{txn.labor || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                <div className="line-clamp-2">{txn.material || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                    {txn.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleEdit(txn)}
                                                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Expanded Row */}
                                        {isExpanded && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={11} className="px-6 py-4">
                                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                                        <div>
                                                            <strong className="text-gray-700">Job Description:</strong>
                                                            <p className="mt-1 text-gray-600">{txn.job || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <strong className="text-gray-700">Scope:</strong>
                                                            <p className="mt-1 text-gray-600 whitespace-pre-wrap">{txn.scope_description || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <strong className="text-gray-700">Labor Details:</strong>
                                                            <p className="mt-1 text-gray-600 whitespace-pre-wrap">{txn.labor || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <strong className="text-gray-700">Materials:</strong>
                                                            <p className="mt-1 text-gray-600 whitespace-pre-wrap">{txn.material || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <strong className="text-gray-700">Evidence:</strong>
                                                            <p className="mt-1 text-gray-600">{txn.evidence || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <strong className="text-gray-700">Status:</strong>
                                                            <p className="mt-1 text-gray-600">{txn.status}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

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
                                <ChevronLeft className="w-4 h-4" />
                                Previous
                            </button>
                            <span className="px-3 py-1 text-sm">Page {page} of {totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                                Next
                                <ChevronRight className="w-4 h-4" />
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
