import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface ImageLightboxProps {
    images: string[];
    currentIndex: number;
    isOpen: boolean;
    onClose: () => void;
    onIndexChange: (index: number) => void;
}

export function ImageLightbox({
    images,
    currentIndex,
    isOpen,
    onClose,
    onIndexChange
}: ImageLightboxProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') {
                onIndexChange((currentIndex - 1 + images.length) % images.length);
            }
            if (e.key === 'ArrowRight') {
                onIndexChange((currentIndex + 1) % images.length);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentIndex, images.length, onClose, onIndexChange]);

    if (!isOpen || images.length === 0) return null;

    const currentImg = images[currentIndex] || images[0];

    return (
        <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Top Toolbar */}
            <div className="absolute top-4 right-4 flex items-center gap-3 z-50">
                <span className="text-white/70 text-xs font-mono">
                    {currentIndex + 1} / {images.length}
                </span>
                <a
                    href={currentImg}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Download / Open Original"
                >
                    <Download className="w-4 h-4" />
                </a>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Close"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Navigation Buttons */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onIndexChange((currentIndex - 1 + images.length) % images.length);
                        }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-50"
                        title="Previous Image"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onIndexChange((currentIndex + 1) % images.length);
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors z-50"
                        title="Next Image"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </>
            )}

            {/* Main Image Container */}
            <div 
                className="max-w-5xl max-h-[85vh] flex items-center justify-center relative"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={currentImg}
                    alt={`Attachment preview ${currentIndex + 1}`}
                    className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl transition-transform"
                />
            </div>
        </div>
    );
}
