import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';

interface User {
    id: number;
    email: string;
    role: 'OM' | 'SU';
    nodeId?: number;
    nodeName?: string;
    isActive: boolean;
    createdAt: string;
}

interface Node {
    id: number;
    name: string;
}

export function Users() {
    const [users, setUsers] = useState<User[]>([]);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'OM' as 'OM' | 'SU',
        nodeId: '',
    });
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setRefreshing(true);
        try {
            const [usersRes, nodesRes] = await Promise.all([
                fetch('/api/users', { credentials: 'include' }),
                fetch('/api/nodes', { credentials: 'include' }),
            ]);

            if (usersRes.ok) {
                const usersData = await usersRes.json();
                // Backend returns { users: [...] }
                if (usersData.users && Array.isArray(usersData.users)) {
                    setUsers(usersData.users);
                }
            } else {
                setUsers([]);
            }
            if (nodesRes.ok) {
                const nodesData = await nodesRes.json();
                // Backend returns { nodes: [...] }
                if (nodesData.nodes && Array.isArray(nodesData.nodes)) {
                    setNodes(nodesData.nodes);
                }
            } else {
                setNodes([]);
            }
        } catch (error) {
            setUsers([]);
            setNodes([]);
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editingId ? `/api/users/${editingId}` : '/api/users';
        const method = editingId ? 'PUT' : 'POST';

        const payload: any = {
            email: formData.email,
            role: formData.role,
        };

        if (!editingId && formData.password) {
            payload.password = formData.password;
        }

        if (formData.role === 'OM' && formData.nodeId) {
            payload.nodeId = parseInt(formData.nodeId);
        }

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (response.ok) {
                resetForm();
                fetchData();
            }
        } catch (error) {
            console.error('Failed to save user:', error);
        }
    };

    const handleEdit = (user: User) => {
        setEditingId(user.id);
        setFormData({
            email: user.email,
            password: '',
            role: user.role,
            nodeId: user.nodeId?.toString() || '',
        });
        setShowForm(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;

        try {
            const response = await fetch(`/api/users/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (response.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Failed to delete user:', error);
        }
    };

    const resetForm = () => {
        setFormData({ email: '', password: '', role: 'OM', nodeId: '' });
        setEditingId(null);
        setShowForm(false);
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
                    <h1 className="text-3xl font-bold text-gray-900">Users</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fetchData()}
                            disabled={refreshing}
                            className="btn-primary btn-sm"
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
                            onClick={() => setShowForm(!showForm)}
                            className="btn-primary btn-sm"
                        >
                            {showForm ? 'Cancel' : '+ Add User'}
                        </button>
                    </div>
                </div>

                <div className="card p-6 mb-6 bg-sky-50 border-sky-200">
                    <h2 className="text-lg font-semibold mb-2">🔐 Users Management</h2>
                    <p className="text-sm text-gray-700">
                        Create and manage Office Managers (OM) and Super Users (SU). OMs are assigned
                        to specific nodes while SUs have access to all nodes.
                    </p>
                </div>

                {/* User Form */}
                {showForm && (
                    <div className="card p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">
                            {editingId ? 'Edit User' : 'Add New User'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="input-field"
                                    required
                                />
                            </div>
                            {!editingId && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="input-field"
                                        required={!editingId}
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Role
                                </label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'OM' | 'SU' })}
                                    className="input-field"
                                >
                                    <option value="OM">Office Manager (OM)</option>
                                    <option value="SU">Super User (SU)</option>
                                </select>
                            </div>
                            {formData.role === 'OM' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Assign to Node
                                    </label>
                                    <select
                                        value={formData.nodeId}
                                        onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
                                        className="input-field"
                                        required={formData.role === 'OM'}
                                    >
                                        <option value="">Select a node...</option>
                                        {nodes.map((node) => (
                                            <option key={node.id} value={node.id}>
                                                {node.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button type="submit" className="btn-primary btn-sm">
                                    {editingId ? 'Update' : 'Create'} User
                                </button>
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="btn-secondary btn-sm"
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                )}

                {/* Users List */}
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Email
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Role
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Node
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">
                                                {user.email}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'SU'
                                                ? 'bg-purple-100 text-purple-800'
                                                : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {user.nodeName || 'All Nodes'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.isActive
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button
                                                onClick={() => handleEdit(user)}
                                                className="text-blue-600 hover:text-blue-900 mr-3"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {users.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No users found
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
