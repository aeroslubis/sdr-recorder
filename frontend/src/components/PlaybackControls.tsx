import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Download,
  Filter,
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
  dspFilterActive = false,
  onToggleDspFilter,
  volume = 1.0,
  onVolumeChange,
  onExportClip,
  hasActiveCall = false,
  activeCallTitle,
  className = '',
}) => {
  return (
    <div
      className={`bg-ash/90 backdrop-blur border border-charcoal rounded-cards px-4 py-3 flex flex-wrap items-center justify-between gap-4 select-none ${className}`}
      aria-label="NVR Playback Controls"
    >
      {/* Left: Transport buttons */}
      <div className="flex items-center gap-2">
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
          className="px-4 py-2 rounded-pill bg-phosphor-green text-obsidian hover:bg-mint-pulse font-medium transition-all cursor-pointer flex items-center gap-1.5 text-xs shadow-sm"
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 fill-obsidian" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-obsidian ml-0.5" />
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

        {activeCallTitle && (
          <div className="hidden lg:flex items-center text-xs text-smoke font-mono ml-2 border-l border-charcoal pl-3">
            Active: <span className="text-silver-mist ml-1 font-semibold">{activeCallTitle}</span>
          </div>
        )}
      </div>

      {/* Center: Playback Speed selector */}
      <div className="flex items-center gap-1 bg-obsidian border border-charcoal rounded-pill p-0.5">
        {SPEED_OPTIONS.map((rate) => {
          const isSelected = Math.abs(rate - playbackRate) < 0.05;
          return (
            <button
              key={rate}
              type="button"
              onClick={() => onPlaybackRateChange?.(rate)}
              aria-label={`${rate.toFixed( rate % 1 === 0 ? 1 : 2 )}x speed`}
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

      {/* Right: DSP Filter, Volume & Export */}
      <div className="flex items-center gap-3">
        {/* DSP Speech Bandpass Filter (300Hz-3kHz) */}
        <button
          type="button"
          onClick={onToggleDspFilter}
          aria-label="Voice Filter (300Hz-3kHz)"
          title="Toggle 300Hz - 3kHz Speech Bandpass Filter"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill border text-xs font-medium transition-colors cursor-pointer ${
            dspFilterActive
              ? 'bg-midnight-emerald/40 border-phosphor-green text-phosphor-green'
              : 'bg-obsidian border-charcoal text-smoke hover:text-silver-mist hover:border-slate'
          }`}
        >
          <Filter className={`w-3.5 h-3.5 ${dspFilterActive ? 'text-phosphor-green' : 'text-smoke'}`} />
          <span>Voice Filter</span>
          <span
            className={`text-[9px] px-1.5 py-0.2 rounded-full uppercase tracking-wider font-mono font-bold ${
              dspFilterActive
                ? 'bg-phosphor-green text-obsidian'
                : 'bg-charcoal text-smoke'
            }`}
          >
            {dspFilterActive ? '300-3k ON' : 'OFF'}
          </span>
        </button>

        {/* Volume Slider */}
        <div className="flex items-center gap-2 bg-obsidian border border-charcoal rounded-pill px-2.5 py-1">
          <button
            type="button"
            onClick={() => onVolumeChange?.(volume > 0 ? 0 : 0.8)}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            className="text-smoke hover:text-snow cursor-pointer"
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
            className="w-16 h-1 bg-charcoal rounded-lg appearance-none cursor-pointer accent-phosphor-green"
          />
        </div>

        {/* Export / Download Clip */}
        {onExportClip && (
          <button
            type="button"
            onClick={onExportClip}
            disabled={!hasActiveCall}
            aria-label="Export Audio Clip"
            title={hasActiveCall ? 'Export active audio recording' : 'Select a call to export'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill border text-xs font-medium transition-colors ${
              hasActiveCall
                ? 'bg-obsidian border-charcoal hover:border-phosphor-green text-silver-mist hover:text-snow cursor-pointer'
                : 'bg-obsidian/50 border-charcoal/50 text-smoke/40 cursor-not-allowed'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        )}
      </div>
    </div>
  );
};
