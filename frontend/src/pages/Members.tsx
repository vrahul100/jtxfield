import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { TrashIcon, PencilIcon } from 'lucide-react';

interface Member {
    id: number;
    full_name: string;
    phone_number: string;
    status: 'active' | 'pending' | 'inactive';
    company_id: number;
    node_name?: string;
    language_preference?: string;
    domain?: string;
    role?: string;
    effective_rate?: number;
    base_rate?: number;
    created_at: string;
}

export function Members() {
    const { user } = useAuth();
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', language: 'en', domain: 'construction', role: 'General Labor' });
    const [formError, setFormError] = useState('');
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [filter, search]);

    useEffect(() => {
        fetchMembers();
    }, [filter, search, page]);

    const fetchMembers = async () => {
        setRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (filter !== 'all') params.append('status', filter);
            if (search.trim()) params.append('search', search.trim());
            params.append('page', page.toString());
            params.append('limit', '10');

            const response = await fetch(`/api/members?${params.toString()}`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.members && Array.isArray(data.members)) {
                    setMembers(data.members);
                    setTotalPages(data.totalPages || 1);
                    setTotal(data.total || 0);
                }
            } else {
                setMembers([]);
            }
        } catch (error) {
            console.error('Failed to fetch members:', error);
            setMembers([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleApprove = async (id: number) => {
        setActionLoading(id);
        try {
            const response = await fetch(`/api/members/${id}/approve`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                fetchMembers();
            }
        } catch (error) {
            console.error('Failed to approve member:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleResendConfirmation = async (id: number) => {
        setActionLoading(id);
        try {
            const response = await fetch(`/api/members/${id}/resend-confirmation`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                alert('Confirmation message sent!');
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to resend confirmation');
            }
        } catch (error) {
            console.error('Failed to resend confirmation:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name || 'this member'}?`)) {
            return;
        }

        setActionLoading(id);
        try {
            const response = await fetch(`/api/members/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (response.ok) {
                fetchMembers();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete member');
            }
        } catch (error) {
            console.error('Failed to delete member:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        try {
            const response = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    phoneNumber: formData.phone,
                    fullName: formData.name,
                    role: formData.role,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setFormData({ name: '', phone: '', language: 'en', domain: 'construction', role: 'General Labor' });
                setShowAddForm(false);
                fetchMembers();
                alert(data.message || 'Member added successfully!');
            } else {
                setFormError(data.error || 'Failed to add member');
            }
        } catch (error) {
            console.error('Failed to add member:', error);
            setFormError('An error occurred while adding the member');
        }
    };

    const handleUpdateMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMember) return;
        setFormError('');

        try {
            const response = await fetch(`/api/members/${editingMember.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fullName: formData.name,
                    language: formData.language,
                    domain: formData.domain,
                    role: formData.role,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setFormData({ name: '', phone: '', language: 'en', domain: 'construction', role: 'General Labor' });
                setEditingMember(null);
                fetchMembers();
                alert('Member updated successfully!');
            } else {
                setFormError(data.error || 'Failed to update member');
            }
        } catch (error) {
            console.error('Failed to update member:', error);
            setFormError('An error occurred while updating the member');
        }
    };

    const startEdit = (member: Member) => {
        setEditingMember(member);
        setFormData({
            name: member.full_name,
            phone: member.phone_number,
            language: member.language_preference || 'en',
            domain: member.domain || 'construction',
            role: member.role || 'General Labor',
        });
        setShowAddForm(false);
        window.scrollTo(0, 0);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return 'bg-green-100 text-green-800';
            case 'pending':
                return 'bg-amber-100 text-yellow-800';
            case 'inactive':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending':
                return 'Awaiting Confirmation';
            case 'active':
                return 'Active';
            case 'inactive':
                return 'Inactive';
            default:
                return status;
        }
    };

    // Client-side sorting only (server handles filtering/pagination)
    const sortedMembers = [...members].sort((a, b) => {
        const aName = a.full_name || '';
        const bName = b.full_name || '';
        const aPhone = a.phone_number || '';
        const bPhone = b.phone_number || '';

        if (sortBy === 'name') return aName.localeCompare(bName);
        if (sortBy === 'phone') return aPhone.localeCompare(bPhone);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

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
            <div className="relative">
                <div className="sticky top-0 z-10 bg-slate-100 pt-2 pb-3 mb-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-3xl font-bold text-gray-900">Members</h1>
                        <div className="flex gap-2">
                            <button
                                onClick={() => fetchMembers()}
                                disabled={refreshing}
                                className="btn-primary flex items-center gap-2"
                                style={refreshing ? { cursor: 'wait' } : {}}
                            >
                                {refreshing && (
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {refreshing ? 'Loading...' : 'Refresh'}
                            </button>
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="btn-primary"
                            >
                                {showAddForm ? 'Cancel' : '+ Invite Member'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Add/Edit Member Form */}
                {(showAddForm || editingMember) && (
                    <div className="card p-6 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">
                                {editingMember ? 'Edit Member' : 'Invite Member'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowAddForm(false);
                                    setEditingMember(null);
                                    setFormData({ name: '', phone: '', language: 'en', domain: 'construction', role: 'General Labor' });
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                &times;
                            </button>
                        </div>
                        {formError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                                {formError}
                            </div>
                        )}
                        <form onSubmit={editingMember ? handleUpdateMember : handleAddMember} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="input-field"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className={`input-field ${editingMember ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    placeholder="+15551234567"
                                    required
                                    disabled={!!editingMember}
                                />
                                {!editingMember && (
                                    <p className="text-sm text-gray-500 mt-1">
                                        Member will receive a WhatsApp invitation to join your team.
                                    </p>
                                )}
                                {editingMember && (
                                    <p className="text-sm text-gray-500 mt-1">
                                        Phone number cannot be changed.
                                    </p>
                                )}
                            </div>
                            {editingMember && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Language Preference
                                        </label>
                                        <select
                                            value={formData.language}
                                            onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                                            className="input-field"
                                        >
                                            <option value="en">English</option>
                                            <option value="es">Spanish</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Domain
                                        </label>
                                        <select
                                            value={formData.domain}
                                             onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                                            className="input-field"
                                        >
                                            <option value="construction">Construction</option>
                                            <option value="recovery">Recovery</option>
                                        </select>
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Role / Trade Position (Determines Rate)
                                </label>
                                <input
                                    type="text"
                                    list="member-roles-list"
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    placeholder="e.g. Foreman, Journeyman, General Labor"
                                    className="input-field w-full"
                                />
                                <datalist id="member-roles-list">
                                    <option value="Foreman" />
                                    <option value="Journeyman" />
                                    <option value="Apprentice" />
                                    <option value="General Labor" />
                                    <option value="Equipment Operator" />
                                    <option value="Carpenter" />
                                    <option value="Electrician" />
                                    <option value="Plumber" />
                                    <option value="Welder" />
                                </datalist>
                                <p className="text-xs text-gray-500 mt-1">
                                    Worker rate will automatically calculate from the node's <a href="/rate-card" className="text-indigo-600 font-semibold hover:underline">Rate Card</a>.
                                </p>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setEditingMember(null);
                                        setFormData({ name: '', phone: '', language: 'en', domain: 'construction', role: 'General Labor' });
                                    }}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary">
                                    {editingMember ? 'Update Member' : 'Send Invitation'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Search, Filters and Sort */}
                <div className="card p-4 mb-6">
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Search by name or phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input-field w-full"
                        />
                    </div>
                    <div className="flex gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Filter by Status
                            </label>
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="input-field"
                            >
                                <option value="all">All</option>
                                <option value="active">Confirmed</option>
                                <option value="pending">Awaiting Confirmation</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Sort by
                            </label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="input-field"
                            >
                                <option value="name">Name</option>
                                <option value="phone">Phone</option>
                                <option value="created">Date Added</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Members List */}
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Phone
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Role / Position
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Rate ($/hr)
                                    </th>
                                    {user?.role === 'SU' && (
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Node
                                        </th>
                                    )}
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Language
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Domain
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {sortedMembers.map((member: Member) => (
                                    <tr key={member.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">
                                                {member.full_name || '(No name)'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">{member.phone_number}</div>
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(member.status)}`}
                                            >
                                                {getStatusLabel(member.status)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                                {member.role || 'General Labor'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="text-sm font-bold text-slate-900">
                                                ${parseFloat(member.effective_rate?.toString() || '85.00').toFixed(2)}
                                                <span className="text-[11px] font-normal text-slate-500">/hr</span>
                                            </span>
                                        </td>
                                        {user?.role === 'SU' && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {member.node_name || 'N/A'}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="text-sm text-gray-500">{member.language_preference}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="text-sm text-gray-500">{member.domain}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                                            {member.status === 'pending' && (
                                                <>
                                                    <button
                                                        onClick={() => handleApprove(member.id)}
                                                        disabled={actionLoading === member.id}
                                                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                                                    >
                                                        {actionLoading === member.id ? '...' : 'Approve'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleResendConfirmation(member.id)}
                                                        disabled={actionLoading === member.id}
                                                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                                                    >
                                                        Resend Invite
                                                    </button>
                                                </>
                                            )}
                                            {member.status !== 'inactive' && (
                                                <button
                                                    onClick={() => handleDelete(member.id, member.full_name)}
                                                    disabled={actionLoading === member.id}
                                                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                                >
                                                    <TrashIcon className="w-6 h-6" strokeWidth={3} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => startEdit(member)}
                                                disabled={actionLoading === member.id}
                                                className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                                            >
                                                <PencilIcon className="w-6 h-6" strokeWidth={3} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {sortedMembers.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No members found
                            </div>
                        )}
                    </div>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-6">
                        <span className="text-sm text-gray-600">
                            Showing {sortedMembers.length} of {total} members
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="px-3 py-1 text-sm">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}

