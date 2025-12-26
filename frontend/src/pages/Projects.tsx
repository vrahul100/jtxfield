import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';

interface Project {
    id: number;
    name: string;
    description: string;
    aliases: string[];
    nodeId: number;
    nodeName?: string;
    isActive: boolean;
    createdAt: string;
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

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const response = await fetch('/api/projects', {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                // Backend returns { projects: [...] }
                if (data.projects && Array.isArray(data.projects)) {
                    setProjects(data.projects);
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
            description: project.description,
            aliases: project.aliases.join(', '),
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
                                    {project.aliases && project.aliases.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            <span className="text-sm text-gray-500">Aliases:</span>
                                            {project.aliases.map((alias, idx) => (
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
            </div>
        </Layout>
    );
}
