import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';

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

export function Transactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchTransactions();
    }, [page]);

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/transactions?page=${page}&limit=20`, {
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
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
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
                    <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
                    <button onClick={fetchTransactions} className="btn-primary">
                        Refresh
                    </button>
                </div>

                <div className="card p-4 mb-6">
                    <div className=" text-sm text-gray-700">
                        Total Transactions: <span className="font-semibold">{total}</span>
                    </div>
                </div>

                <div className="card overflow-hidden">
                    <table className="table-auto w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time (hrs)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labor</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {transactions.map((txn) => (
                                <tr key={txn.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">#{txn.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{formatDate(txn.created_at)}</td>
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
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded-full ${txn.status === 'COMPLETED'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {txn.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {transactions.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            No transactions found.
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                        <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="px-4 py-2">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </Layout>
    );
}
