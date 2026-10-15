import React from 'react';
import { AlertTriangle, RefreshCw, Settings, X, Radio } from 'lucide-react';

export interface NoDeviceModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

/**
 * Prominent Warning Modal displayed when no SDR Dongle hardware is detected
 * or when the dongle is disconnected. Informs the user that recording is stopped.
 */
export const NoDeviceModal: React.FC<NoDeviceModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  onOpenSettings,
  className = '',
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="no-device-title"
      aria-describedby="no-device-desc"
      className={`fixed inset-0 z-50 bg-obsidian/85 backdrop-blur-sm flex items-center justify-center p-4 select-none ${className}`}
    >
      <div className="bg-ash border border-red-500/40 rounded-cards max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-150">
        {/* Close / Dismiss Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Alert"
            className="absolute top-4 right-4 text-smoke hover:text-snow p-1 rounded-pill hover:bg-obsidian transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header with Alert Icon & Title */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0 text-red-400">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>

          <div className="flex-1">
            <h3 id="no-device-title" className="text-base font-semibold text-snow">
              No SDR Hardware Device Connected
            </h3>
            <p className="text-xs font-mono text-red-400 font-medium mt-0.5">
              [●] RADIO RECORDING STOPPED · HARDWARE OFFLINE
            </p>
          </div>
        </div>

        {/* Description Body */}
        <div id="no-device-desc" className="text-xs text-silver-mist space-y-2.5">
          <p>
            The <span className="text-snow font-mono font-medium">RTL-SDR USB</span> dongle hardware
            was not detected on the computer port. All radio frequency recording processes are halted
            automatically to avoid generating empty audio files.
          </p>

          <div className="bg-obsidian/90 border border-charcoal rounded-inputs p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-2 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
              <span>Recording Status: HALTED (NO HARDWARE)</span>
            </div>
            <div className="flex items-center gap-2 text-smoke">
              <Radio className="w-3.5 h-3.5 text-smoke" />
              <span>Spectrum: FLAT (No RF signal received)</span>
            </div>
            <div className="text-smoke pt-1 border-t border-charcoal">
              Please ensure the RTL-SDR USB dongle is securely plugged in. The system will automatically detect the device and resume recording once reconnected.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-2 rounded-pill bg-obsidian border border-charcoal hover:border-slate text-silver-mist hover:text-snow text-xs font-mono transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Dongle Configuration</span>
            </button>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 px-4 py-2 rounded-pill bg-phosphor-green hover:bg-mint-pulse text-obsidian text-xs font-medium font-mono transition-colors cursor-pointer font-semibold shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Device Detection</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
