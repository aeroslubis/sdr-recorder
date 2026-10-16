import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';

export interface PlaybackControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrevCall: () => void;
  onNextCall: () => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  dspFilterActive?: boolean;
  onToggleDspFilter?: () => void;
  volume?: number;
  onVolumeChange?: (vol: number) => void;
  onExportClip?: () => void;
  hasActiveCall?: boolean;
  activeCallTitle?: string;
  className?: string;
}

const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0];

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  onPlayPause,
  onPrevCall,
  onNextCall,
  playbackRate = 1.0,
  onPlaybackRateChange,
  volume = 1.0,
  onVolumeChange,
  className = '',
}) => {
  return (
    <div
      className={`bg-ash/90 backdrop-blur border border-charcoal rounded-cards px-3 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 select-none ${className}`}
      aria-label="Audio Playback Controls"
    >
      {/* Left: Transport buttons + Volume slider */}
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-wrap">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onPrevCall}
            aria-label="Prev Call"
            title="Previous Transmission"
            className="p-2 rounded-pill bg-obsidian border border-charcoal hover:border-slate text-silver-mist hover:text-snow transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
          >
            <SkipBack className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <button
            type="button"
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="w-[84px] justify-center px-3 py-2 rounded-pill bg-phosphor-green text-obsidian hover:bg-mint-pulse font-medium transition-colors cursor-pointer flex items-center gap-1.5 text-xs shadow-sm flex-shrink-0"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-obsidian shrink-0" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-obsidian shrink-0" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onNextCall}
            aria-label="Next Call"
            title="Next Transmission"
            className="p-2 rounded-pill bg-obsidian border border-charcoal hover:border-slate text-silver-mist hover:text-snow transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
          >
            <span className="hidden sm:inline">Next</span>
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Volume Slider right next to playback controls */}
        <div className="flex items-center gap-2 bg-obsidian border border-charcoal rounded-pill px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => onVolumeChange?.(volume > 0 ? 0 : 0.8)}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            className="text-smoke hover:text-snow cursor-pointer flex items-center"
          >
            {volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-smoke" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-silver-mist" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
            aria-label="Volume slider"
            className="w-16 sm:w-20 h-1 bg-charcoal rounded-lg appearance-none cursor-pointer accent-phosphor-green"
          />
        </div>
      </div>

      {/* Right: Playback Speed selector */}
      <div className="flex items-center gap-1 bg-obsidian border border-charcoal rounded-pill p-0.5">
        {SPEED_OPTIONS.map((rate) => {
          const isSelected = Math.abs(rate - playbackRate) < 0.05;
          return (
            <button
              key={rate}
              type="button"
              onClick={() => onPlaybackRateChange?.(rate)}
              aria-label={`${rate.toFixed(rate % 1 === 0 ? 1 : 2)}x speed`}
              className={`px-2.5 py-1 rounded-pill text-[11px] font-mono transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-phosphor-green text-obsidian font-semibold'
                  : 'text-smoke hover:text-snow'
              }`}
            >
              {rate.toFixed(rate % 1 === 0 ? 1 : 2)}x
            </button>
          );
        })}
      </div>
    </div>
  );
};
