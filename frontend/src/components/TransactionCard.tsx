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

    // Status color for card header bar only
    const getHeaderBgColor = (status: string): string => {
        if (status === 'COMPLETED') return 'bg-green-500';
        if (status === 'PENDING') return 'bg-orange-500';
        return 'bg-gray-200';
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
        if (!transaction.evidence) return <span className="text-md text-gray-500">N/A</span>;
        try {
            const links = JSON.parse(transaction.evidence);
            if (Array.isArray(links)) {
                return links.map((link, i) => (
                    <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-md underline text-blue-600 hover:text-blue-800 break-all block"
                    >
                        {link.split('/').pop() || `Evidence ${i + 1}`}
                    </a>
                ));
            }
            return <a href={transaction.evidence} target="_blank" rel="noopener noreferrer" className="text-md underline text-blue-600">Link</a>;
        } catch {
            return <a href={transaction.evidence} target="_blank" rel="noopener noreferrer" className="text-md underline text-blue-600">Link</a>;
        }
    };

    return (
        <div className={`card overflow-hidden hover:shadow-lg transition-shadow bg-white ${isExpanded ? 'border-4 border-indigo-500' : ''}`}>
            {/* Card Header - Status Color Bar */}
            <div className={`h-4 ${getHeaderBgColor(transaction.status)}`}></div>
            <div
                className={`p-4 cursor-pointer ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                onClick={onToggleExpand}
            >
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-md font-mono text-gray-500">#{transaction.id}</span>
                                <span className={`px-2 py-0.5 text-md font-semibold rounded border ${getStatusColor(transaction.status)}`}>
                                    {transaction.status}
                                </span>
                                <span className="text-md text-gray-500">Ticket #{transaction.bucket_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <div className="text-md text-gray-500 whitespace-nowrap">{formatDate(transaction.created_at)}</div>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-xs text-gray-500">{transaction.member_name || 'Unknown'}</span>
                                        <span className="bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center text-xs text-gray-600">
                                            {transaction.member_name ? transaction.member_name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
                                        </span>
                                    </div>
                                </div>
                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-gray-400 mt-1" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-400 mt-1" />
                                )}
                            </div>
                        </div>

                        {/* Project and Description */}
                        <div className="mb-3">
                            <div className="flex items-center gap-1 text-md text-gray-600 mb-1">
                                <span>📍</span>
                                <span className="font-medium">{transaction.project_name || 'No Project'}</span>
                            </div>
                            {transaction.ai_summary ? (
                                <div className="flex items-start gap-1">
                                    <span className="text-base text-black">🤖</span>
                                    <p className="text-md text-gray-700 italic">{transaction.ai_summary}</p>
                                </div>
                            ) : transaction.job ? (
                                <p className="text-md text-gray-700 line-clamp-2">{transaction.job}</p>
                            ) : (
                                <p className="text-md text-gray-400">(No description)</p>
                            )}
                        </div>

                        {/* Time, Labor, Materials */}
                        <div className="pt-2 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                                {/* Time */}
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium text-gray-500 mb-0.5">Time</span>
                                    {transaction.time !== null && transaction.time !== undefined ? (
                                        <span className="text-md font-medium text-gray-900">{Number(transaction.time).toFixed(1)}h</span>
                                    ) : (
                                        <span className="text-md text-gray-400 italic">Not recorded</span>
                                    )}
                                </div>
                                
                                {/* Labor */}
                                {transaction.labor && (
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium text-gray-500 mb-0.5">Labor</span>
                                        <span className="text-md text-gray-900">{transaction.labor}</span>
                                    </div>
                                )}
                                
                                {/* Materials */}
                                {transaction.material && (
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium text-gray-500 mb-0.5">Materials</span>
                                        <span className="text-md text-gray-900">{transaction.material}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Indicators */}
                        <div className="flex items-center gap-3 mt-3">
                            {transaction.potential_change && (
                                <div className="flex items-center gap-1 text-orange-600" title="Potential scope change">
                                    <AlertTriangle className="w-4 h-4" fill="currentColor" />
                                    <span className="text-md">Change</span>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="p-4 bg-gray-50  border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div>
                                <strong className="text-md font-semibold text-gray-700">Scope:</strong>
                                <p className="text-md mt-1 text-gray-600 whitespace-pre-wrap">{transaction.scope_description || 'N/A'}</p>
                            </div>

                            <div>
                                <strong className="text-md font-semibold text-gray-700">Evidence:</strong>
                                <div className="flex flex-col gap-1 mt-1">
                                    {renderEvidence()}
                                </div>
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
                    className="flex items-center gap-1 px-3 py-1.5 text-md text-blue-600 hover:bg-gray-50 rounded transition-colors"
                    title="Edit"
                >
                    <PencilIcon className="w-4 h-4" strokeWidth={3} />
                    Edit
                </button>
            </div>
        </div>
    );
}
