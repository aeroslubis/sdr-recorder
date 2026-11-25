import React, { useRef, useCallback, useState, useEffect } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

export interface SMeterBarProps {
  rssi: number; // in dBFS, range -100 to 0
  squelchThreshold: number; // in dBFS, range -100 to 0
  squelchOpen: boolean;
  onSquelchChange?: (newThreshold: number) => void;
  disabled?: boolean;
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
  disabled = false,
  className = '',
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const [dragThreshold, setDragThreshold] = useState<number | null>(null);
  const isDragging = dragThreshold !== null;

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

  // Clamp RSSI and displayed squelch (preview while dragging, committed prop otherwise) to [-100, 0]
  const activeThreshold = dragThreshold !== null ? dragThreshold : squelchThreshold;
  const clampedRssi = Math.max(-100, Math.min(0, rssi));
  const clampedThreshold = Math.max(-100, Math.min(0, activeThreshold));

  // Convert dBFS (-100 to 0) to percentage (0% to 100%)
  const rssiPercent = ((clampedRssi + 100) / 100) * 100;
  const thresholdPercent = ((clampedThreshold + 100) / 100) * 100;

  const computeThresholdFromClientX = useCallback((clientX: number): number | null => {
    if (!Number.isFinite(clientX) || !barRef.current) return null;
    const rect = barRef.current.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return null;
    const rawX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, rawX / rect.width));
    const val = -100 + ratio * 100;
    return Math.round(val * 10) / 10;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !onSquelchChange || !barRef.current) return;
      cleanupDragRef.current?.();

      const targetEl = e.currentTarget;
      targetEl.setPointerCapture?.(e.pointerId);

      const previousBodyCursor = document.body.style.cursor;
      document.body.style.cursor = 'ew-resize';

      let latestThreshold = computeThresholdFromClientX(e.clientX);
      if (latestThreshold !== null) {
        setDragThreshold(latestThreshold);
      }

      const onPointerMove = (moveEvt: PointerEvent) => {
        const nextVal = computeThresholdFromClientX(moveEvt.clientX);
        if (nextVal !== null) {
          latestThreshold = nextVal;
          setDragThreshold(nextVal);
        }
      };

      const finishDrag = (commit: boolean, pointerId?: number) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        cleanupDragRef.current = null;
        document.body.style.cursor = previousBodyCursor;
        if (pointerId !== undefined) {
          try {
            targetEl.releasePointerCapture?.(pointerId);
          } catch {
            // ignore
          }
        }
        setDragThreshold(null);
        if (commit && latestThreshold !== null) {
          onSquelchChange(latestThreshold);
        }
      };

      const onPointerUp = (upEvt: PointerEvent) => {
        finishDrag(true, upEvt.pointerId);
      };

      const onPointerCancel = (cancelEvt: PointerEvent) => {
        finishDrag(false, cancelEvt.pointerId);
      };

      cleanupDragRef.current = () => finishDrag(false);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    },
    [disabled, onSquelchChange, computeThresholdFromClientX]
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
        </div>
      </div>

      {/* S-Meter Bar track */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        className={`relative h-6 w-full bg-ash border border-charcoal rounded-inputs overflow-hidden ${
          disabled ? 'cursor-not-allowed opacity-90' : 'cursor-ew-resize group'
        }`}
        title={
          disabled
            ? `Auto Squelch active (${clampedThreshold.toFixed(1)} dBFS locked). Disable SQL AUTO to adjust manually.`
            : `Click or drag to set squelch threshold (currently ${clampedThreshold.toFixed(1)} dBFS)`
        }
        role="slider"
        aria-label="Squelch threshold"
        aria-disabled={disabled}
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
          className={`absolute top-0 bottom-0 w-1.5 -ml-[3px] bg-snow z-10 pointer-events-none shadow-sm flex items-center justify-center ${
            isDragging ? '' : 'transition-[left] duration-75'
          }`}
          style={{ left: `${thresholdPercent}%` }}
        >
          <div className="w-0.5 h-full bg-obsidian" />
          {!disabled && (
            <div
              className={`absolute flex items-center justify-center w-3.5 h-4 rounded-sm bg-snow text-obsidian shadow transition-opacity ${
                isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <ChevronsLeftRight className="w-3 h-3" />
            </div>
          )}
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
