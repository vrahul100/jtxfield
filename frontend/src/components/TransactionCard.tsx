import {
    AlertTriangle,
    PencilIcon,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

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
    ai_summary: string | null;
    potential_change: boolean | null;
    created_at: string;
    member_name: string | null;
    member_phone: string | null;
    project_name: string | null;
    node_name: string | null;
}

interface TransactionCardProps {
    transaction: Transaction;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onEdit: () => void;
}

export function TransactionCard({
    transaction,
    isExpanded,
    onToggleExpand,
    onEdit
}: TransactionCardProps) {
    const getStatusColor = (status: string) => {
        if (status === 'COMPLETED') return 'bg-green-100 text-green-800 border-green-200';
        if (status === 'PENDING') return 'bg-orange-100 text-orange-800 border-orange-200';
        return 'bg-gray-100 text-gray-800 border-gray-200';
    };

    const getCardBgColor = (status: string) => {
        if (status === 'COMPLETED') return 'bg-green-50';
        if (status === 'PENDING') return 'bg-orange-50';
        return 'bg-white';
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderEvidence = () => {
        if (!transaction.evidence) return <span className="text-xs text-gray-500">N/A</span>;
        try {
            const links = JSON.parse(transaction.evidence);
            if (Array.isArray(links)) {
                return links.map((link, i) => (
                    <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline text-blue-600 hover:text-blue-800 break-all block"
                    >
                        {link.split('/').pop() || `Evidence ${i + 1}`}
                    </a>
                ));
            }
            return <a href={transaction.evidence} target="_blank" rel="noopener noreferrer" className="text-xs underline text-blue-600">Link</a>;
        } catch {
            return <a href={transaction.evidence} target="_blank" rel="noopener noreferrer" className="text-xs underline text-blue-600">Link</a>;
        }
    };

    return (
        <div className={`card overflow-hidden hover:shadow-lg transition-shadow ${getCardBgColor(transaction.status)} ${isExpanded ? 'border-4 border-indigo-500' : ''}`}>
            {/* Card Header */}
            <div
                className={`p-4 border-b cursor-pointer ${isExpanded ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                onClick={onToggleExpand}
            >
                <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-sm font-mono text-gray-500">#{transaction.id}</span>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getStatusColor(transaction.status)}`}>
                                {transaction.status}
                            </span>
                            <span className="text-xs text-gray-500">Ticket #{transaction.bucket_id}</span>
                            {transaction.time && (
                                <span className="text-xs font-semibold text-gray-700">
                                    {Number(transaction.time).toFixed(1)}h
                                </span>
                            )}
                        </div>

                        {/* AI Summary or Job */}
                        {transaction.ai_summary ? (
                            <div className="mb-2">
                                <div className="flex items-start gap-1">
                                    <span className="text-base">✨</span>
                                    <p className="text-sm font-medium text-gray-900 italic">{transaction.ai_summary}</p>
                                </div>
                            </div>
                        ) : transaction.job ? (
                            <p className="text-sm text-gray-900 mb-2 line-clamp-2">{transaction.job}</p>
                        ) : (
                            <p className="text-sm text-gray-500 mb-2">(No description)</p>
                        )}

                        {/* Member and Project */}
                        <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                <span>👤</span>
                                <span className="font-medium">{transaction.member_name || 'Unknown'}</span>
                                {transaction.member_phone && <span className="text-gray-400">({transaction.member_phone})</span>}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                                <span>📍</span>
                                <span className="font-medium">{transaction.project_name || 'No Project'}</span>
                            </div>
                        </div>

                        {/* Quick Indicators */}
                        <div className="flex items-center gap-3 mt-2">
                            {transaction.potential_change && (
                                <div className="flex items-center gap-1 text-orange-600" title="Potential scope change">
                                    <AlertTriangle className="w-4 h-4" fill="currentColor" />
                                    <span className="text-xs">Change</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Date and Expand Icon */}
                    <div className="flex flex-col items-end gap-2">
                        <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(transaction.created_at)}</span>
                        {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="p-4 bg-blue-50 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            {transaction.ai_summary && (
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <span className="text-black font-semibold uppercase text-xs">✨ AI Summary</span>
                                    <p className="text-gray-700 italic text-sm mt-1">{transaction.ai_summary}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div>
                                    <strong className="text-xs font-semibold text-gray-700">Job Description:</strong>
                                    <p className="text-xs mt-1 text-gray-600">{transaction.job || 'N/A'}</p>
                                </div>

                                <div>
                                    <strong className="text-xs font-semibold text-gray-700">Labor Details:</strong>
                                    <p className="text-xs mt-1 text-gray-600 whitespace-pre-wrap">{transaction.labor || 'N/A'}</p>
                                </div>

                                <div>
                                    <strong className="text-xs font-semibold text-gray-700">Materials:</strong>
                                    <p className="text-xs mt-1 text-gray-600 whitespace-pre-wrap">{transaction.material || 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <strong className="text-xs font-semibold text-gray-700">Scope:</strong>
                                <p className="text-xs mt-1 text-gray-600 whitespace-pre-wrap">{transaction.scope_description || 'N/A'}</p>
                            </div>

                            <div>
                                <strong className="text-xs font-semibold text-gray-700">Evidence:</strong>
                                <div className="flex flex-col gap-1 mt-1">
                                    {renderEvidence()}
                                </div>
                            </div>

                            <div className="text-xs text-gray-500">
                                Created: {formatDate(transaction.created_at)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="p-3 bg-gray-50 border-t flex gap-2 justify-end">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit"
                >
                    <PencilIcon className="w-4 h-4" strokeWidth={3} />
                    Edit
                </button>
            </div>
        </div>
    );
}
