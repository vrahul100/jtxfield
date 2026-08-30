import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { PencilIcon, TrashIcon, FileText } from 'lucide-react';
interface Project {
    id: number;
    name: string;
    description: string;
    aliases: string | null;  // JSON string from database
    radius: number | null;
    nodeId: number;
    node_id?: number;
    nodeName?: string;
    node_name?: string;
    isActive?: boolean;
    is_active?: boolean;
    createdAt?: string;
    created_at?: string;
}

interface NodeOption {
    id: number;
    name: string;
}

// Helper to safely parse aliases JSON string
function parseAliases(aliases: string | null): string[] {
    if (!aliases) return [];
    try {
        const parsed = JSON.parse(aliases);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// Helper to get isActive from project (handles both snake_case and camelCase)
function getIsActive(project: Project): boolean {
    return project.is_active ?? project.isActive ?? true;
}

// Helper to get node_id from project
function getNodeId(project: Project): number {
    return project.node_id ?? project.nodeId ?? 0;
}

export function Projects() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [nodes, setNodes] = useState<NodeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        aliases: '',
        radius: '',
        isActive: true,
        nodeId: '',
    });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [search]);

    useEffect(() => {
        fetchProjects();
        if (user?.role === 'SU') {
            fetchNodes();
        }
    }, [search, page]);

    const fetchNodes = async () => {
        try {
            const response = await fetch('/api/nodes', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                if (data.nodes && Array.isArray(data.nodes)) {
                    setNodes(data.nodes);
                }
            }
        } catch (error) {
            console.error('Failed to fetch nodes:', error);
        }
    };

    const fetchProjects = async () => {
        setLoading(true);
        setRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (search.trim()) params.append('search', search.trim());
            params.append('page', page.toString());
            params.append('limit', '10');

            const response = await fetch(`/api/projects?${params.toString()}`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.projects && Array.isArray(data.projects)) {
                    // Filter out Inbox project
                    const filtered = data.projects.filter((p: Project) => p.name !== 'Inbox');
                    setProjects(filtered);
                    setTotalPages(data.totalPages || 1);
                    setTotal(data.total || 0);
                }
            } else {
                setProjects([]);
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
            setProjects([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editingId ? `/api/projects/${editingId}` : '/api/projects';
        const method = editingId ? 'PUT' : 'POST';

        const payload: any = {
            name: formData.name,
            description: formData.description,
            aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean),
            radius: formData.radius,
            isActive: formData.isActive,
        };

        // Include nodeId for SU
        if (user?.role === 'SU' && formData.nodeId) {
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
                await fetchProjects();
            } else {
                const data = await response.json();
                alert(`Save failed: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Failed to save project:', error);
            alert('Failed to save project. Check console for details.');
        }
    };

    const handleEdit = (project: Project) => {
        setEditingId(project.id);
        setFormData({
            name: project.name,
            description: project.description || '',
            aliases: parseAliases(project.aliases).join(', '),
            radius: project.radius ? project.radius.toString() : '',
            isActive: getIsActive(project),
            nodeId: getNodeId(project).toString(),
        });
        setShowForm(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this project?')) return;

        try {
            const response = await fetch(`/api/projects/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (response.ok) {
                // Force a fresh fetch
                await fetchProjects();
            } else {
                const data = await response.json();
                alert(`Delete failed: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
            alert('Failed to delete project. Check console for details.');
        }
    };

    const resetForm = () => {
        setFormData({ name: '', description: '', aliases: '', radius: '', isActive: true, nodeId: '' });
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
            <div className="relative">
                <div className="sticky top-0 z-10 bg-slate-100 pt-2 pb-3 mb-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
                        <div className="flex gap-2">
                            <button
                                onClick={() => fetchProjects()}
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
                                onClick={() => setShowForm(!showForm)}
                                className="btn-primary"
                            >
                                {showForm ? 'Cancel' : '+ Add Project'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="card p-4 mb-6">
                    <input
                        type="text"
                        placeholder="Search projects by name or alias..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input-field w-full"
                    />
                </div>

                {/* Project Form */}
                {showForm && (
                    <div className="card p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">
                            {editingId ? 'Edit Project' : 'Add New Project'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Project Name
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
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="input-field"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Aliases (comma-separated)
                                </label>
                                <input
                                    type="text"
                                    value={formData.aliases}
                                    onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                                    className="input-field"
                                    placeholder="mall project, downtown mall, city center"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Alternative names workers might use to refer to this project
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Geofence Radius (meters)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.radius}
                                    onChange={(e) => setFormData({ ...formData, radius: e.target.value })}
                                    className="input-field"
                                    placeholder="e.g. 50"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Distance from center where work can be logged
                                </p>
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                />
                                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                                    Active Project
                                </label>
                            </div>
                            {user?.role === 'SU' && nodes.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Node
                                    </label>
                                    <select
                                        value={formData.nodeId}
                                        onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
                                        className="input-field"
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
                                <button type="submit" className="btn-primary">
                                    {editingId ? 'Update' : 'Create'} Project
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

                {/* Projects List */}
                <div className="space-y-4">
                    {projects.map((project) => (
                        <div key={project.id} className="card p-6">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl font-semibold text-gray-900">
                                            {project.name}
                                        </h3>
                                        <span
                                            className={`px-2 py-1 text-xs font-semibold rounded-full ${getIsActive(project)
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                                }`}
                                        >
                                            {getIsActive(project) ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    {project.description && (
                                        <p className="text-gray-600 mb-3">{project.description}</p>
                                    )}
                                    {parseAliases(project.aliases).length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            <span className="text-sm text-gray-500">Aliases:</span>
                                            {parseAliases(project.aliases).map((alias, idx) => (
                                                <span
                                                    key={idx}
                                                    className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded"
                                                >
                                                    {alias}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {user?.role === 'SU' && (project.node_name || project.nodeName) && (
                                        <p className="text-sm text-gray-500 mb-2">Node: {project.node_name || project.nodeName}</p>
                                    )}
                                    {project.radius !== null && project.radius !== undefined && (
                                        <p className="text-sm text-gray-500 mb-2">📍 Radius: {project.radius}m</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link
                                        to={`/reports?tab=project-report&projectId=${project.id}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
                                        title="View Project Progress Report"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>Progress Report</span>
                                    </Link>
                                    <button
                                        onClick={() => handleEdit(project)}
                                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                                        title="Edit Project"
                                    >
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(project.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete Project"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {projects.length === 0 && (
                        <div className="card p-8 text-center text-gray-500">
                            No projects found. Click "Add Project" to create one.
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-6">
                        <span className="text-sm text-gray-600">
                            Showing {projects.length} of {total} projects
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
