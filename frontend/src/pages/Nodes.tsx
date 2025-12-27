import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';

interface Node {
    id: number;
    name: string;
    description: string;
    isActive: boolean;
    createdAt: string;
}

export function Nodes() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
    });

    useEffect(() => {
        fetchNodes();
    }, []);

    const fetchNodes = async () => {
        try {
            const response = await fetch('/api/nodes', {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                // Backend returns { nodes: [...] }
                if (data.nodes && Array.isArray(data.nodes)) {
                    setNodes(data.nodes);
                }
            } else {
                setNodes([]);
            }
        } catch (error) {
            console.error('Failed to fetch nodes:', error);
            setNodes([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editingId ? `/api/nodes/${editingId}` : '/api/nodes';
        const method = editingId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData),
            });
            if (response.ok) {
                resetForm();
                fetchNodes();
            }
        } catch (error) {
            console.error('Failed to save node:', error);
        }
    };

    const handleEdit = (node: Node) => {
        setEditingId(node.id);
        setFormData({
            name: node.name,
            description: node.description,
        });
        setShowForm(true);
    };

    const resetForm = () => {
        setFormData({ name: '', description: '' });
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
                    <h1 className="text-3xl font-bold text-gray-900">Nodes</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fetchNodes()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
                        >
                            🔄 Refresh
                        </button>
                        <button
                            onClick={() => setShowForm(!showForm)}
                            className="btn-primary"
                        >
                            {showForm ? 'Cancel' : '+ Add Node'}
                        </button>
                    </div>
                </div>

                <div className="card p-6 mb-6 bg-blue-50 border-blue-200">
                    <h2 className="text-lg font-semibold mb-2">🏢 Nodes Management</h2>
                    <p className="text-sm text-gray-700">
                        Nodes represent construction companies or entities. Each node has its own
                        projects, members, and office managers.
                    </p>
                </div>

                {/* Node Form */}
                {showForm && (
                    <div className="card p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">
                            {editingId ? 'Edit Node' : 'Add New Node'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Node Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="input-field"
                                    placeholder="Downtown Construction"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="input-field"
                                    rows={3}
                                    placeholder="Construction company specializing in..."
                                />
                            </div>
                            <div className="flex gap-2">
                                <button type="submit" className="btn-primary">
                                    {editingId ? 'Update' : 'Create'} Node
                                </button>
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                )}

                {/* Nodes List */}
                <div className="grid gap-4">
                    {nodes.map((node) => (
                        <div key={node.id} className="card p-6">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            {node.name}
                                        </h3>
                                        <span
                                            className={`px-2 py-1 text-xs font-semibold rounded-full ${node.isActive
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                                }`}
                                        >
                                            {node.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    {node.description && (
                                        <p className="text-gray-600 mb-2">{node.description}</p>
                                    )}
                                    <p className="text-sm text-gray-500">
                                        Created: {new Date(node.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleEdit(node)}
                                    className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    ))}
                    {nodes.length === 0 && (
                        <div className="card p-8 text-center text-gray-500">
                            No nodes found. Click "Add Node" to create one.
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
