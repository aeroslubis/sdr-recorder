import React, { useRef, useCallback } from 'react';

export interface SMeterBarProps {
  rssi: number; // in dBFS, range -100 to 0
  squelchThreshold: number; // in dBFS, range -100 to 0
  squelchOpen: boolean;
  onSquelchChange?: (newThreshold: number) => void;
  className?: string;
}

/**
 * Real-time RSSI meter (-100 to 0 dBFS) with phosphor green / gradient bar,
 * interactive draggable squelch threshold marker needle with numerical readout,
 * and squelch open/closed indicator.
 */
export const SMeterBar: React.FC<SMeterBarProps> = ({
  rssi,
  squelchThreshold,
  squelchOpen,
  onSquelchChange,
  className = '',
}) => {
  const barRef = useRef<HTMLDivElement>(null);

  // Clamp RSSI and squelch to [-100, 0]
  const clampedRssi = Math.max(-100, Math.min(0, rssi));
  const clampedThreshold = Math.max(-100, Math.min(0, squelchThreshold));

  // Convert dBFS (-100 to 0) to percentage (0% to 100%)
  const rssiPercent = ((clampedRssi + 100) / 100) * 100;
  const thresholdPercent = ((clampedThreshold + 100) / 100) * 100;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onSquelchChange || !barRef.current) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      const updateThresholdFromPointer = (clientX: number) => {
        if (!barRef.current) return;
        const rect = barRef.current.getBoundingClientRect();
        const rawX = clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, rawX / rect.width));
        // ratio 0 -> -100 dBFS, ratio 1 -> 0 dBFS
        const val = -100 + ratio * 100;
        onSquelchChange(Math.round(val * 10) / 10);
      };

      updateThresholdFromPointer(e.clientX);

      const onPointerMove = (moveEvt: PointerEvent) => {
        updateThresholdFromPointer(moveEvt.clientX);
      };

      const onPointerUp = (upEvt: PointerEvent) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        try {
          (e.target as HTMLElement).releasePointerCapture?.(upEvt.pointerId);
        } catch {
          // ignore
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [onSquelchChange]
  );

  const isBypass = clampedThreshold <= -98;

  return (
    <div className={`flex flex-col gap-1.5 w-full select-none ${className}`}>
      {/* Readout Header */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-smoke text-[11px] font-sans">RSSI:</span>
          <span className="text-snow font-medium">
            {clampedRssi.toFixed(1)} dBFS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-smoke text-[11px] font-sans">SQL:</span>
          <span className={isBypass ? 'text-amber-400 font-semibold' : 'text-silver-mist'}>
            {isBypass ? 'BYPASS' : `${clampedThreshold.toFixed(1)} dBFS`}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide transition-colors ${
              isBypass
                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                : squelchOpen
                ? 'bg-phosphor-green/20 text-phosphor-green border border-phosphor-green/40'
                : 'bg-charcoal text-smoke border border-slate'
            }`}
          >
            {isBypass ? 'OPEN (BYPASS)' : squelchOpen ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
      </div>

      {/* S-Meter Bar track */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        className="relative h-6 w-full bg-ash border border-charcoal rounded-inputs overflow-hidden cursor-crosshair group"
        title={`Click or drag to set squelch threshold (currently ${clampedThreshold.toFixed(1)} dBFS)`}
        role="slider"
        aria-label="Squelch threshold"
        aria-valuemin={-100}
        aria-valuemax={0}
        aria-valuenow={clampedThreshold}
      >
        {/* Background graduation ticks (every 10 dBFS) */}
        <div className="absolute inset-0 flex justify-between pointer-events-none px-1">
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={i}
              className={`h-full w-px ${i % 2 === 0 ? 'bg-charcoal' : 'bg-slate/40'}`}
            />
          ))}
        </div>

        {/* Real-time RSSI Level Fill Bar */}
        <div
          className="absolute top-0 bottom-0 left-0 transition-[width] duration-75 ease-out rounded-l-[7px]"
          style={{
            width: `${rssiPercent}%`,
            background: squelchOpen
              ? 'linear-gradient(90deg, #1f4b37 0%, #00c573 60%, #3ecf8e 100%)'
              : 'linear-gradient(90deg, #2e2e2e 0%, #4d4d4d 70%, #898989 100%)',
          }}
        />

        {/* Squelch Needle Marker */}
        <div
          className="absolute top-0 bottom-0 w-1.5 -ml-[3px] bg-snow z-10 pointer-events-none shadow-sm flex items-center justify-center transition-[left] duration-75"
          style={{ left: `${thresholdPercent}%` }}
        >
          <div className="w-0.5 h-full bg-obsidian" />
        </div>
      </div>

      {/* dBFS Scale markings */}
      <div className="flex justify-between text-[10px] text-smoke font-mono px-0.5 pointer-events-none">
        <span>-100</span>
        <span>-80</span>
        <span>-60</span>
        <span>-40</span>
        <span>-20</span>
        <span>0 dBFS</span>
      </div>
    </div>
  );
};
