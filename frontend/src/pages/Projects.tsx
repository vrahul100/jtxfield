import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';

interface Project {
    id: number;
    name: string;
    description: string;
    aliases: string | null;  // JSON string from database
    nodeId: number;
    nodeName?: string;
    isActive: boolean;
    createdAt: string;
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

export function Projects() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        aliases: '',
    });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        setPage(1);
    }, [search]);

    useEffect(() => {
        fetchProjects();
    }, [search, page]);

    const fetchProjects = async () => {
        try {
            const params = new URLSearchParams();
            if (search.trim()) params.append('search', search.trim());
            params.append('page', page.toString());
            params.append('limit', '20');

            const response = await fetch(`/api/projects?${params.toString()}`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                if (data.projects && Array.isArray(data.projects)) {
                    setProjects(data.projects);
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
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editingId ? `/api/projects/${editingId}` : '/api/projects';
        const method = editingId ? 'PUT' : 'POST';

        const payload = {
            name: formData.name,
            description: formData.description,
            aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean),
        };

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (response.ok) {
                resetForm();
                fetchProjects();
            }
        } catch (error) {
            console.error('Failed to save project:', error);
        }
    };

    const handleEdit = (project: Project) => {
        setEditingId(project.id);
        setFormData({
            name: project.name,
            description: project.description || '',
            aliases: parseAliases(project.aliases).join(', '),
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
                fetchProjects();
            }
        } catch (error) {
            console.error('Failed to delete project:', error);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', description: '', aliases: '' });
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
                    <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="btn-primary"
                    >
                        {showForm ? 'Cancel' : '+ Add Project'}
                    </button>
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
                                            className={`px-2 py-1 text-xs font-semibold rounded-full ${project.isActive
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                                }`}
                                        >
                                            {project.isActive ? 'Active' : 'Inactive'}
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
                                                    className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
                                                >
                                                    {alias}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {user?.role === 'SU' && project.nodeName && (
                                        <p className="text-sm text-gray-500">Node: {project.nodeName}</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEdit(project)}
                                        className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(project.id)}
                                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                                    >
                                        Delete
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
