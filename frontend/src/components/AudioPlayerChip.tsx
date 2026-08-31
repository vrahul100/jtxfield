import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AlertCircle } from 'lucide-react';

interface AudioPlayerChipProps {
    src: string;
    label?: string;
    className?: string;
}

export function AudioPlayerChip({ src, label, className = '' }: AudioPlayerChipProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [hasError, setHasError] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const audio = new Audio(src);
        audioRef.current = audio;

        const onLoadedMetadata = () => {
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        const onError = () => {
            setHasError(true);
            setIsPlaying(false);
        };

        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
            audio.pause();
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
        };
    }, [src]);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current || hasError) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch((err) => {
                    console.warn('Audio playback failed:', err);
                    setHasError(true);
                });
        }
    };

    const formatTime = (secs: number) => {
        if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const progressRatio = duration > 0 ? currentTime / duration : 0;

    // Simulated waveform bar heights
    const waveformBars = [40, 75, 100, 60, 85, 45, 95, 30, 80, 65, 90, 50, 70, 85, 40, 60];

    return (
        <div 
            onClick={togglePlay}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50/90 hover:bg-sky-100/90 border border-sky-200/80 transition-all cursor-pointer select-none text-slate-800 shadow-2xs ${className}`}
            title={label || 'Voice Note'}
        >
            <button
                type="button"
                onClick={togglePlay}
                disabled={hasError}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform active:scale-95 flex-shrink-0 ${
                    hasError 
                        ? 'bg-rose-100 text-rose-600' 
                        : isPlaying 
                        ? 'bg-sky-500 text-white shadow-xs' 
                        : 'bg-sky-500 text-white hover:bg-sky-600'
                }`}
                aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
            >
                {hasError ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                ) : isPlaying ? (
                    <Pause className="w-3 h-3 fill-current" />
                ) : (
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                )}
            </button>

            {/* Waveform Visualization */}
            <div className="flex items-center gap-0.5 h-4 w-20 sm:w-24">
                {waveformBars.map((height, i) => {
                    const barProgress = i / waveformBars.length;
                    const isPlayed = barProgress <= progressRatio;
                    return (
                        <div
                            key={i}
                            className={`w-1 rounded-full transition-all duration-150 ${
                                isPlayed 
                                    ? 'bg-sky-500' 
                                    : 'bg-sky-200'
                            } ${isPlaying ? 'animate-pulse' : ''}`}
                            style={{ 
                                height: `${Math.max(20, height)}%`,
                                animationDelay: `${(i % 5) * 100}ms`
                            }}
                        />
                    );
                })}
            </div>

            {/* Time progress */}
            <span className="text-[11px] font-mono font-medium text-slate-600 min-w-[28px]">
                {isPlaying ? formatTime(currentTime) : (duration > 0 ? formatTime(duration) : '0:14')}
            </span>
        </div>
    );
}
