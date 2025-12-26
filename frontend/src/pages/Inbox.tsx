import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';

interface InboxEntry {
    id: number;
    tag: string;
    description: string;
    memberName: string;
    createdAt: string;
}

interface GroupedEntries {
    [tag: string]: InboxEntry[];
}

interface Project {
    id: number;
    name: string;
}

export function Inbox() {
    const { user } = useAuth();
    const [entries, setEntries] = useState<InboxEntry[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [selectedProject, setSelectedProject] = useState<number | null>(null);

    useEffect(() => {
        fetchInboxData();
    }, []);

    const fetchInboxData = async () => {
        try {
            const nodeId = user?.nodeId || 1; // Default to 1 for SU
            const [entriesRes, projectsRes] = await Promise.all([
                fetch(`/api/inbox/${nodeId}`, { credentials: 'include' }),
                fetch('/api/projects', { credentials: 'include' }),
            ]);

            if (entriesRes.ok) {
                const entriesData = await entriesRes.json();
                // Backend returns { nodeId, totalTags, totalBuckets, entries: [...] }
                if (entriesData.entries && Array.isArray(entriesData.entries)) {
                    setEntries(entriesData.entries);
                }
            } else {
                setEntries([]);
            }
            if (projectsRes.ok) {
                const projectsData = await projectsRes.json();
                // Backend returns { projects: [...] }
                if (projectsData.projects && Array.isArray(projectsData.projects)) {
                    // Filter out Inbox project from choices
                    const filteredProjects = projectsData.projects.filter(
                        (p: any) => p.name !== 'Inbox' && !p.is_inbox
                    );
                    setProjects(filteredProjects);
                }
            } else {
                setProjects([]);
            }
        } catch (error) {
            console.error('Failed to fetch inbox data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkAssign = async () => {
        if (!selectedTag || !selectedProject) return;

        try {
            const response = await fetch('/api/inbox/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    tag: selectedTag,
                    projectId: selectedProject,
                }),
            });

            if (response.ok) {
                setSelectedTag(null);
                setSelectedProject(null);
                fetchInboxData();
            }
        } catch (error) {
            console.error('Failed to bulk assign:', error);
        }
    };

    const handleAddAlias = async () => {
        if (!selectedTag || !selectedProject) return;

        try {
            const response = await fetch('/api/inbox/add-alias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    alias: selectedTag,
                    projectId: selectedProject,
                }),
            });

            if (response.ok) {
                alert('Alias added successfully! Future messages will auto-route.');
            }
        } catch (error) {
            console.error('Failed to add alias:', error);
        }
    };

    const groupedEntries: GroupedEntries = entries.reduce((acc, entry) => {
        const tag = entry.tag || 'Untagged';
        if (!acc[tag]) acc[tag] = [];
        acc[tag].push(entry);
        return acc;
    }, {} as GroupedEntries);

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
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Inbox</h1>

                <div className="card p-6 mb-6 bg-blue-50 border-blue-200">
                    <h2 className="text-lg font-semibold mb-2">📥 Inbox Workflow</h2>
                    <p className="text-sm text-gray-700">
                        Work entries that couldn't be auto-assigned to a project. Review grouped entries,
                        assign them to the correct project, and optionally add the tag as an alias for
                        future auto-routing.
                    </p>
                </div>

                {/* Assignment Controls */}
                {selectedTag && (
                    <div className="card p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">
                            Assign "{selectedTag}" entries
                        </h2>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Assign to Project
                                </label>
                                <select
                                    value={selectedProject || ''}
                                    onChange={(e) => setSelectedProject(Number(e.target.value))}
                                    className="input-field"
                                >
                                    <option value="">Select a project...</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleBulkAssign}
                                disabled={!selectedProject}
                                className="btn-primary disabled:opacity-50"
                            >
                                Bulk Assign
                            </button>
                            <button
                                onClick={handleAddAlias}
                                disabled={!selectedProject}
                                className="px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50"
                            >
                                + Add as Alias
                            </button>
                        </div>
                    </div>
                )}

                {/* Grouped Entries */}
                <div className="space-y-6">
                    {Object.entries(groupedEntries).map(([tag, tagEntries]) => (
                        <div key={tag} className="card overflow-hidden">
                            <div
                                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${selectedTag === tag ? 'bg-primary-50 border-primary-200' : ''
                                    }`}
                                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">
                                            Tag: {tag}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {tagEntries.length} {tagEntries.length === 1 ? 'entry' : 'entries'}
                                        </p>
                                    </div>
                                    <span className="text-2xl">
                                        {selectedTag === tag ? '▼' : '▶'}
                                    </span>
                                </div>
                            </div>

                            {selectedTag === tag && (
                                <div className="divide-y divide-gray-200">
                                    {tagEntries.map((entry) => (
                                        <div key={entry.id} className="p-4 hover:bg-gray-50">
                                            <div className="flex justify-between">
                                                <div>
                                                    <p className="text-gray-900">{entry.description}</p>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        By: {entry.memberName} •{' '}
                                                        {new Date(entry.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {Object.keys(groupedEntries).length === 0 && (
                        <div className="card p-8 text-center text-gray-500">
                            <p className="text-xl mb-2">🎉 Inbox is empty!</p>
                            <p className="text-sm">All work entries have been assigned to projects.</p>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
