import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { ProjectProgressReportView } from '../components/ProjectProgressReportView';
import { ArrowLeft } from 'lucide-react';

export function ProjectTimeline() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    useAuth();

    return (
        <Layout>
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6 max-w-7xl w-full mx-auto pb-16 px-2 sm:px-4">
                {/* Back to Reports navigation header */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={() => navigate('/reports')}
                        className="btn-secondary btn-sm"
                        title="Back to Reports"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to Reports</span>
                    </button>
                </div>

                <ProjectProgressReportView 
                    initialProjectId={id ? Number(id) : null}
                    onProjectChange={(newId) => {
                        navigate(`/projects/${newId}/timeline`, { replace: true });
                    }}
                />
            </div>
        </Layout>
    );
}
