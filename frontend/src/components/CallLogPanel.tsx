import React from 'react';
import {
  Play,
  Square,
  Download,
  Calendar,
  Radio,
  Clock,
} from 'lucide-react';
import { HistoryDatePicker, formatDate } from './HistoryDatePicker';

export interface CallLogItem {
  id: number;
  startTime?: string;
  start_time?: string;
  durationSec?: number;
  duration_sec?: number;
  frequencyHz?: number;
  frequency_hz?: number;
  modulation?: string;
  peakRssi?: number;
  peak_rssi?: number;
  peak_rssi_dbfs?: number;
  isStarred?: boolean;
  is_starred?: boolean | number;
  notes?: string;
  file_path?: string;
}

export interface CallLogPanelProps {
  calls?: CallLogItem[];
  selectedCallId?: number | null;
  playingCallId?: number | null;
  onPlay?: (call: CallLogItem) => void;
  onStop?: () => void;
  onToggleStar?: (callId: number, nextStarred: boolean) => void;
  onDownload?: (callId: number) => void;
  onSelectCall?: (callId: number) => void;
  currentDate?: string;
  onDateChange?: (date: string) => void;
  activeDates?: string[];
  isLoading?: boolean;
  className?: string;
}

/** Normalize time display to HH:MM:SS */
function formatCallTime(call: CallLogItem): string {
  if (call.startTime) {
    if (call.startTime.includes('T')) {
      const parts = call.startTime.split('T');
      return parts[1].split('.')[0] || call.startTime;
    }
    return call.startTime;
  }
  if (call.start_time) {
    if (call.start_time.includes('T')) {
      const parts = call.start_time.split('T');
      return parts[1].split('.')[0];
    }
    const spaceParts = call.start_time.split(' ');
    if (spaceParts.length > 1) {
      return spaceParts[1].split('.')[0];
    }
    return call.start_time;
  }
  return '--:--:--';
}

/** Format frequency to MHz with 3 decimals e.g. 118.200 MHz */
function formatFrequency(hz?: number): string {
  if (!hz) return '--- MHz';
  return `${(hz / 1e6).toFixed(3)} MHz`;
}

export const CallLogPanel: React.FC<CallLogPanelProps> = ({
  calls = [],
  selectedCallId = null,
  playingCallId = null,
  onPlay,
  onStop,
  onDownload,
  onSelectCall,
  currentDate = formatDate(new Date()),
  onDateChange,
  activeDates,
  isLoading = false,
  className = '',
}) => {
  const handleDownload = (id: number) => {
    if (onDownload) {
      onDownload(id);
    } else {
      // Default download link fallback
      const token = localStorage.getItem('sdr_auth_token') || sessionStorage.getItem('sdr_auth_token');
      const downloadUrl = `/api/recordings/${id}/audio?download=true${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `transmission-${id}.opus`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <aside
      className={`w-full lg:w-80 xl:w-[340px] bg-obsidian border-l border-charcoal flex flex-col h-full max-h-full min-h-0 overflow-hidden select-none ${className}`}
      aria-label="Call Log History Panel"
    >
      {/* Top Header & Calendar Date Picker */}
      <div className="p-3 border-b border-charcoal flex flex-col gap-2.5 bg-obsidian/95 backdrop-blur flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-phosphor-green" />
            <h2 className="text-xs font-semibold text-snow uppercase tracking-wider">
              Call Log History
            </h2>
          </div>
          <span className="text-[11px] font-mono text-smoke">
            {calls.length} calls
          </span>
        </div>

        {/* Interactive Date Picker */}
        {onDateChange ? (
          <HistoryDatePicker
            selectedDate={currentDate}
            onSelectDate={onDateChange}
            activeDates={activeDates}
          />
        ) : (
          <div className="flex items-center justify-between px-3 py-1.5 bg-ash border border-charcoal rounded-pill text-xs font-mono text-silver-mist">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-phosphor-green" />
              <span>{currentDate}</span>
            </span>
            <span className="text-smoke text-[10px]">{calls.length} logs</span>
          </div>
        )}
      </div>

      {/* Call Cards List */}
      <div tabIndex={0} aria-label="Call History List" className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 focus:outline-none">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-silver-mist gap-2">
            <div className="w-4 h-4 border-2 border-phosphor-green border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono">Loading call history...</span>
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-smoke text-center px-4">
            <Radio className="w-8 h-8 text-charcoal mb-2" />
            <p className="text-xs font-medium text-silver-mist">No transmissions found</p>
            <p className="text-[11px] text-smoke mt-1">
              No radio activity recorded for this period.
            </p>
          </div>
        ) : (
          calls.map((call) => {
            const isSelected = selectedCallId === call.id;
            const isPlaying = playingCallId === call.id;
            const duration = (call.durationSec ?? call.duration_sec ?? 0).toFixed(1);
            const peakRssi = (call.peakRssi ?? call.peak_rssi ?? call.peak_rssi_dbfs ?? -60).toFixed(0);
            const timeStr = formatCallTime(call);
            const freqStr = formatFrequency(call.frequencyHz ?? call.frequency_hz);
            const mod = call.modulation ?? 'AM';

            return (
              <div
                key={call.id}
                onClick={() => onSelectCall?.(call.id)}
                className={`p-2.5 rounded-cards border transition-all cursor-pointer ${
                  isPlaying
                    ? 'bg-forest-depth/40 border-phosphor-green shadow-[0_0_12px_rgba(62,207,142,0.15)]'
                    : isSelected
                    ? 'bg-ash border-slate'
                    : 'bg-ash/70 border-charcoal hover:border-slate hover:bg-ash'
                }`}
              >
                {/* Top Row: Time, Duration & Actions */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-snow">
                    <Clock className="w-3 h-3 text-phosphor-green" />
                    <span>{timeStr}</span>
                    <span className="text-[11px] text-smoke">({duration}s)</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Quick Play/Stop Button */}
                    {isPlaying ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStop?.();
                        }}
                        aria-label="Stop Call"
                        title="Stop Playback"
                        className="p-1 rounded-pill transition-colors cursor-pointer bg-phosphor-green text-obsidian hover:bg-red-500 hover:text-snow"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlay?.(call);
                        }}
                        aria-label="Play Call"
                        title="Quick Play"
                        className="p-1 rounded-pill transition-colors cursor-pointer hover:bg-obsidian text-silver-mist hover:text-phosphor-green"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(call.id);
                      }}
                      aria-label="Download Call"
                      title="Download Audio File"
                      className="p-1 rounded-pill hover:bg-obsidian text-smoke hover:text-snow transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Frequency, Modulation & RSSI */}
                <div className="flex items-center justify-between text-[11px] font-mono text-smoke">
                  <div className="flex items-center gap-1.5">
                    <span className="text-silver-mist">{freqStr}</span>
                    <span className="px-1 py-0.2 bg-obsidian border border-charcoal rounded text-[10px] text-phosphor-green">
                      {mod}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>RSSI:</span>
                    <span
                      className={
                        Number(peakRssi) > -35
                          ? 'text-phosphor-green font-medium'
                          : Number(peakRssi) > -50
                          ? 'text-silver-mist'
                          : 'text-smoke'
                      }
                    >
                      {peakRssi} dBFS
                    </span>
                  </div>
                </div>

                {/* Optional Notes snippet if present */}
                {call.notes && (
                  <div className="mt-1.5 pt-1 border-t border-charcoal/60 text-[11px] font-sans text-silver-mist truncate">
                    💬 {call.notes}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
