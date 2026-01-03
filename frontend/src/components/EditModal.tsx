import React from 'react';
import { X } from 'lucide-react';

export interface EditField {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'number';
    value: string | number | null;
    options?: { value: string | number; label: string }[]; // For select fields
    required?: boolean;
    rows?: number; // For textarea
}

interface EditModalProps {
    isOpen: boolean;
    title: string;
    fields: EditField[];
    onSave: (values: Record<string, any>) => Promise<void>;
    onClose: () => void;
    loading?: boolean;
}

export function EditModal({ isOpen, title, fields, onSave, onClose, loading }: EditModalProps) {
    const [values, setValues] = React.useState<Record<string, any>>({});
    const [saving, setSaving] = React.useState(false);

    // Initialize values when modal opens
    React.useEffect(() => {
        if (isOpen) {
            const initialValues: Record<string, any> = {};
            fields.forEach(field => {
                initialValues[field.name] = field.value ?? '';
            });
            setValues(initialValues);
        }
    }, [isOpen, fields]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(values);
            onClose();
        } catch (error) {
            console.error('Failed to save:', error);
            alert('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-lg font-semibold text-indigo-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                        disabled={saving}
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        {fields.map((field) => (
                            <div key={field.name}>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                </label>

                                {field.type === 'textarea' ? (
                                    <textarea
                                        value={values[field.name] ?? ''}
                                        onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                                        className="input-field w-full"
                                        rows={field.rows || 4}
                                        required={field.required}
                                    />
                                ) : field.type === 'select' ? (
                                    <select
                                        value={values[field.name] ?? ''}
                                        onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                                        className="input-field w-full"
                                        required={field.required}
                                    >
                                        <option value="">Select...</option>
                                        {field.options?.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                ) : field.type === 'number' ? (
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={values[field.name] ?? ''}
                                        onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                                        className="input-field w-full"
                                        required={field.required}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={values[field.name] ?? ''}
                                        onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                                        className="input-field w-full"
                                        required={field.required}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={saving || loading}
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
