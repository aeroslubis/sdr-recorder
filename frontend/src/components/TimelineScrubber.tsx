import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  DAY_MS,
  ZoomPreset,
  ZOOM_DURATIONS_MS,
  timeMsToCanvasX,
  canvasXToTimeMs,
  formatMsToTime,
  formatMsToShortTime,
  getTickIntervals,
  formatDurationSec,
} from './timelineUtils';
import { Calendar, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

export interface TransmissionInterval {
  id: number;
  start_ms: number;
  end_ms: number;
  peak_rssi?: number;
  duration_sec?: number;
  frequency_hz?: number;
  modulation?: string;
  notes?: string;
}

export interface TimelineScrubberProps {
  date?: string;
  transmissions: TransmissionInterval[];
  currentTimeMs: number;
  onSeek: (timeMs: number) => void;
  onSelectTransmission?: (id: number) => void;
  selectedTransmissionId?: number | null;
  className?: string;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  date = new Date().toISOString().split('T')[0],
  transmissions = [],
  currentTimeMs,
  onSeek,
  onSelectTransmission,
  selectedTransmissionId = null,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Visible timeline viewport in milliseconds [viewStartMs, viewEndMs]
  const [viewStartMs, setViewStartMs] = useState<number>(0);
  const [viewEndMs, setViewEndMs] = useState<number>(DAY_MS);
  const [activePreset, setActivePreset] = useState<ZoomPreset>('24h');

  // Mouse hover state for live cursor tooltip
  const [hoverState, setHoverState] = useState<{
    x: number;
    timeMs: number;
    hoveredTransmission: TransmissionInterval | null;
  } | null>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Set zoom preset centered at current playhead
  const setZoomPreset = useCallback(
    (preset: ZoomPreset) => {
      setActivePreset(preset);
      const span = ZOOM_DURATIONS_MS[preset];
      if (span >= DAY_MS) {
        setViewStartMs(0);
        setViewEndMs(DAY_MS);
        return;
      }

      // Center around current playhead
      let newStart = currentTimeMs - span / 2;
      let newEnd = currentTimeMs + span / 2;

      if (newStart < 0) {
        newStart = 0;
        newEnd = span;
      } else if (newEnd > DAY_MS) {
        newEnd = DAY_MS;
        newStart = DAY_MS - span;
      }

      setViewStartMs(Math.max(0, newStart));
      setViewEndMs(Math.min(DAY_MS, newEnd));
    },
    [currentTimeMs]
  );

  // Pan viewport left or right
  const handlePan = (fraction: number) => {
    const span = viewEndMs - viewStartMs;
    const delta = span * fraction;
    let newStart = viewStartMs + delta;
    let newEnd = viewEndMs + delta;

    if (newStart < 0) {
      newStart = 0;
      newEnd = Math.min(DAY_MS, span);
    } else if (newEnd > DAY_MS) {
      newEnd = DAY_MS;
      newStart = Math.max(0, DAY_MS - span);
    }

    setViewStartMs(newStart);
    setViewEndMs(newEnd);
  };

  // Redraw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#121212'; // Obsidian
    ctx.fillRect(0, 0, width, height);

    const rulerHeight = 28;
    const trackHeight = height - rulerHeight;

    // Ruler background
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, width, rulerHeight);

    // Hairline divider
    ctx.strokeStyle = '#2e2e2e'; // Charcoal
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight);
    ctx.lineTo(width, rulerHeight);
    ctx.stroke();

    // Calculate ruler tick intervals
    const viewDuration = viewEndMs - viewStartMs;
    const tickConfig = getTickIntervals(viewDuration);

    // Minor ticks
    const firstMinor = Math.floor(viewStartMs / tickConfig.minorMs) * tickConfig.minorMs;
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 1;
    for (let t = firstMinor; t <= viewEndMs; t += tickConfig.minorMs) {
      if (t < viewStartMs) continue;
      const x = timeMsToCanvasX(t, viewStartMs, viewEndMs, width);
      ctx.beginPath();
      ctx.moveTo(x, rulerHeight - 5);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();
    }

    // Major ticks & labels
    const firstMajor = Math.floor(viewStartMs / tickConfig.majorMs) * tickConfig.majorMs;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let t = firstMajor; t <= viewEndMs; t += tickConfig.majorMs) {
      if (t < viewStartMs) continue;
      const x = timeMsToCanvasX(t, viewStartMs, viewEndMs, width);

      // Major tick line
      ctx.strokeStyle = '#4d4d4d'; // Graphite
      ctx.beginPath();
      ctx.moveTo(x, rulerHeight - 10);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();

      // Tick label
      ctx.fillStyle = '#898989'; // Smoke
      const label = formatMsToShortTime(t, tickConfig.showSeconds);
      // Keep labels inside bounds
      const clampedX = Math.max(18, Math.min(width - 18, x));
      ctx.fillText(label, clampedX, 4);

      // Subtle track grid line down the canvas
      ctx.strokeStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(x, rulerHeight);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Render transmissions
    for (const item of transmissions) {
      if (item.end_ms < viewStartMs || item.start_ms > viewEndMs) continue;

      const x1 = timeMsToCanvasX(item.start_ms, viewStartMs, viewEndMs, width);
      const x2 = timeMsToCanvasX(item.end_ms, viewStartMs, viewEndMs, width);
      const blockWidth = Math.max(2.5, x2 - x1);

      const isSelected = item.id === selectedTransmissionId;

      // Calculate bar height based on peak_rssi (-100 to 0 dBFS)
      const rssi = item.peak_rssi ?? -50;
      const normRssi = Math.max(0.2, Math.min(1.0, (rssi + 90) / 70));
      const barH = Math.max(12, trackHeight * normRssi * 0.85);
      const barY = height - barH - 4;

      // Phosphor Green styling (#3ecf8e)
      if (isSelected) {
        ctx.fillStyle = '#fafafa'; // White highlight for selected
        ctx.fillRect(x1 - 1, barY - 2, blockWidth + 2, barH + 4);
        ctx.fillStyle = '#3ecf8e'; // Phosphor green
        ctx.fillRect(x1, barY, blockWidth, barH);
      } else {
        // Normal transmission block
        ctx.fillStyle = '#3ecf8e';
        ctx.fillRect(x1, barY, blockWidth, barH);

        // Peak highlight top cap
        ctx.fillStyle = '#00c573'; // Mint pulse
        ctx.fillRect(x1, barY, blockWidth, Math.min(3, barH));
      }
    }

    // Render Hover Line
    if (hoverState && hoverState.x >= 0 && hoverState.x <= width) {
      ctx.strokeStyle = 'rgba(250, 250, 250, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverState.x, 0);
      ctx.lineTo(hoverState.x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Render Playhead Needle (Red / White with Green indicator cap)
    if (currentTimeMs >= viewStartMs && currentTimeMs <= viewEndMs) {
      const playheadX = timeMsToCanvasX(currentTimeMs, viewStartMs, viewEndMs, width);

      // Playhead vertical line
      ctx.strokeStyle = '#ef4444'; // Red playhead
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Top indicator triangle/diamond
      ctx.fillStyle = '#3ecf8e'; // Phosphor green head
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 8);
      ctx.closePath();
      ctx.fill();

      // Small white center dot
      ctx.fillStyle = '#fafafa';
      ctx.beginPath();
      ctx.arc(playheadX, 10, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    viewStartMs,
    viewEndMs,
    transmissions,
    selectedTransmissionId,
    hoverState,
    currentTimeMs,
  ]);

  // Keep canvas resolution synced to container width
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const newWidth = Math.floor(rect.width) || 800;
      const newHeight = 110;

      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
      }
      draw();
    };

    updateSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      resizeObserver?.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Find transmission at given time (with tolerance based on view width)
  const findTransmissionAtTime = (timeMs: number): TransmissionInterval | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const span = viewEndMs - viewStartMs;
    // Tolerance of ~5 pixels
    const toleranceMs = (5 / canvas.width) * span;

    for (const t of transmissions) {
      if (timeMs >= t.start_ms - toleranceMs && timeMs <= t.end_ms + toleranceMs) {
        return t;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const clickedTimeMs = canvasXToTimeMs(x, viewStartMs, viewEndMs, canvas.width);

    setIsDragging(true);
    if (typeof canvas.setPointerCapture === 'function') {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    // Check if clicked directly on an active transmission
    const hit = findTransmissionAtTime(clickedTimeMs);
    if (hit) {
      onSelectTransmission?.(hit.id);
      onSeek(hit.start_ms);
    } else {
      onSeek(clickedTimeMs);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const hoveredTime = canvasXToTimeMs(x, viewStartMs, viewEndMs, canvas.width);

    const hit = findTransmissionAtTime(hoveredTime);
    setHoverState({
      x,
      timeMs: hoveredTime,
      hoveredTransmission: hit,
    });

    if (isDragging) {
      onSeek(hoveredTime);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDragging(false);
    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverState(null);
    }
  };

  const viewStartMsRef = useRef(viewStartMs);
  const viewEndMsRef = useRef(viewEndMs);
  useEffect(() => {
    viewStartMsRef.current = viewStartMs;
    viewEndMsRef.current = viewEndMs;
  }, [viewStartMs, viewEndMs]);

  // Native non-passive wheel event listener to zoom timeline without zooming browser WebUI or scrolling page
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const onWheel = (e: WheelEvent) => {
      // Prevent browser default page zoom (Ctrl+wheel, trackpad pinch) and window scrolling
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const cursorX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const cursorFraction = rect.width > 0 ? cursorX / rect.width : 0.5;
      const cursorTimeMs = canvasXToTimeMs(cursorX, viewStartMsRef.current, viewEndMsRef.current, canvas.width);

      const zoomFactor = e.deltaY < 0 ? 0.75 : 1.33;
      const currentSpan = viewEndMsRef.current - viewStartMsRef.current;
      const minSpan = 60_000; // minimum 1 min zoom
      const maxSpan = DAY_MS;  // 24h

      let newSpan = Math.max(minSpan, Math.min(maxSpan, currentSpan * zoomFactor));

      let newStart = cursorTimeMs - cursorFraction * newSpan;
      let newEnd = newStart + newSpan;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(DAY_MS, newSpan);
      } else if (newEnd > DAY_MS) {
        newEnd = DAY_MS;
        newStart = Math.max(0, DAY_MS - newSpan);
      }

      setViewStartMs(newStart);
      setViewEndMs(newEnd);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`bg-ash border border-charcoal rounded-cards p-3 flex flex-col gap-2 select-none relative overscroll-contain ${className}`}
      aria-label="24-Hour Timeline Scrubber"
    >
      {/* Top Header & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Date & Current Playhead readout */}
        <div className="flex items-center gap-3 font-mono">
          <div className="flex items-center gap-1.5 text-silver-mist bg-obsidian border border-charcoal px-2.5 py-1 rounded-inputs">
            <Calendar className="w-3.5 h-3.5 text-phosphor-green" />
            <span className="font-semibold text-snow">{date}</span>
          </div>
          <div className="text-smoke">
            Playhead: <span className="text-phosphor-green font-bold">{formatMsToTime(currentTimeMs)}</span>
          </div>
        </div>

        {/* Zoom Presets & Pan Step */}
        <div className="flex items-center gap-2">
          {/* Pan Step */}
          <div className="flex items-center bg-obsidian border border-charcoal rounded-pill">
            <button
              type="button"
              onClick={() => handlePan(-0.25)}
              aria-label="Pan Left"
              title="Pan left 25%"
              className="p-1.5 text-smoke hover:text-snow transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handlePan(0.25)}
              aria-label="Pan Right"
              title="Pan right 25%"
              className="p-1.5 text-smoke hover:text-snow transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center bg-obsidian border border-charcoal rounded-pill p-0.5">
            {(['24h', '6h', '1h', '15m'] as ZoomPreset[]).map((preset) => {
              const isSelected = activePreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setZoomPreset(preset)}
                  className={`px-2.5 py-1 rounded-pill text-[11px] font-mono transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-phosphor-green text-obsidian font-semibold'
                      : 'text-smoke hover:text-snow'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>

          {/* Quick Zoom Buttons */}
          <div className="flex items-center gap-1 text-smoke">
            <button
              type="button"
              onClick={() => {
                const currentSpan = viewEndMs - viewStartMs;
                const newSpan = Math.max(60_000, currentSpan * 0.7);
                const mid = (viewStartMs + viewEndMs) / 2;
                setViewStartMs(Math.max(0, mid - newSpan / 2));
                setViewEndMs(Math.min(DAY_MS, mid + newSpan / 2));
              }}
              title="Zoom In"
              aria-label="Zoom In"
              className="p-1.5 bg-obsidian border border-charcoal hover:border-slate rounded-pill text-smoke hover:text-snow cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const currentSpan = viewEndMs - viewStartMs;
                const newSpan = Math.min(DAY_MS, currentSpan * 1.4);
                const mid = (viewStartMs + viewEndMs) / 2;
                setViewStartMs(Math.max(0, mid - newSpan / 2));
                setViewEndMs(Math.min(DAY_MS, mid + newSpan / 2));
              }}
              title="Zoom Out"
              aria-label="Zoom Out"
              className="p-1.5 bg-obsidian border border-charcoal hover:border-slate rounded-pill text-smoke hover:text-snow cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Area with live tooltip */}
      <div className="relative rounded-inputs overflow-hidden border border-charcoal bg-obsidian">
        <canvas
          ref={canvasRef}
          data-testid="timeline-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="w-full h-[110px] block cursor-crosshair touch-none"
        />

        {/* Live Timestamp Hover Tooltip */}
        {hoverState && (
          <div
            className="pointer-events-none absolute top-1 z-20 px-2 py-1 rounded bg-obsidian/95 border border-charcoal text-[11px] font-mono text-snow shadow-lg flex items-center gap-2"
            style={{
              left: `${Math.max(10, Math.min((canvasRef.current?.width || 800) - 160, hoverState.x - 70))}px`,
            }}
          >
            <span className="text-phosphor-green font-semibold">
              {formatMsToTime(hoverState.timeMs)}
            </span>
            {hoverState.hoveredTransmission && (
              <span className="text-smoke border-l border-charcoal pl-1.5 text-[10px]">
                {formatDurationSec(hoverState.hoveredTransmission.duration_sec ?? 0)} ·{' '}
                {hoverState.hoveredTransmission.peak_rssi?.toFixed(1)}dB
              </span>
            )}
          </div>
        )}
      </div>

      {/* Legend & transmission count */}
      <div className="flex items-center justify-between text-[11px] text-smoke px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-phosphor-green rounded-sm" />
            <span>Recorded Transmissions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-0.5 bg-red-500 rounded-sm" />
            <span>Playhead</span>
          </div>
        </div>
        <div>
          {transmissions.length} calls recorded on {date}
        </div>
      </div>
    </div>
  );
};
