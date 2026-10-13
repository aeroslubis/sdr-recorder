/**
 * Constants & helper utilities for 24-hour timeline projection and formatting.
 */

export const DAY_MS = 86_400_000; // 24 * 60 * 60 * 1000 ms

export type ZoomPreset = '24h' | '6h' | '1h' | '15m';

export const ZOOM_DURATIONS_MS: Record<ZoomPreset, number> = {
  '24h': 86_400_000,
  '6h': 21_600_000,
  '1h': 3_600_000,
  '15m': 900_000,
};

/**
 * Projects a timestamp in milliseconds into a canvas X coordinate.
 */
export function timeMsToCanvasX(
  timeMs: number,
  viewStartMs: number,
  viewEndMs: number,
  canvasWidth: number
): number {
  const span = viewEndMs - viewStartMs;
  if (span <= 0 || canvasWidth <= 0) return 0;
  return ((timeMs - viewStartMs) / span) * canvasWidth;
}

/**
 * Reverts a canvas X coordinate into a timestamp in milliseconds.
 */
export function canvasXToTimeMs(
  x: number,
  viewStartMs: number,
  viewEndMs: number,
  canvasWidth: number
): number {
  if (canvasWidth <= 0) return viewStartMs;
  const span = viewEndMs - viewStartMs;
  return viewStartMs + (x / canvasWidth) * span;
}

/**
 * Formats a duration or timestamp offset in milliseconds to "HH:MM:SS".
 */
export function formatMsToTime(ms: number): string {
  // Clamp within 00:00:00 - 23:59:59
  const clamped = Math.max(0, Math.min(DAY_MS - 1000, Math.floor(ms)));
  const totalSec = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Formats milliseconds to a short time label (e.g. "14:30" or "14:30:15").
 */
export function formatMsToShortTime(ms: number, includeSeconds = false): string {
  const clamped = Math.max(0, Math.min(DAY_MS - 1000, Math.floor(ms)));
  const totalSec = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');

  if (includeSeconds) {
    const seconds = totalSec % 60;
    const ss = seconds.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
}

/**
 * Formats duration in seconds to human readable form (e.g. "4.2s" or "1m 15s").
 */
export function formatDurationSec(sec: number): string {
  if (sec < 60) {
    return `${sec.toFixed(1)}s`;
  }
  const mins = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${mins}m ${remSec}s`;
}

export interface TickIntervalConfig {
  majorMs: number;
  minorMs: number;
  showSeconds: boolean;
}

/**
 * Calculates optimal ruler tick intervals based on visible time span.
 */
export function getTickIntervals(viewDurationMs: number): TickIntervalConfig {
  if (viewDurationMs > 43_200_000) {
    // > 12 hours (e.g. 24h view)
    return {
      majorMs: 3_600_000, // 1 hour
      minorMs: 900_000,   // 15 mins
      showSeconds: false,
    };
  } else if (viewDurationMs > 10_800_000) {
    // 3h - 12h (e.g. 6h view)
    return {
      majorMs: 1_800_000, // 30 mins
      minorMs: 300_000,   // 5 mins
      showSeconds: false,
    };
  } else if (viewDurationMs > 1_800_000) {
    // 30m - 3h (e.g. 1h view)
    return {
      majorMs: 600_000,  // 10 mins
      minorMs: 60_000,   // 1 min
      showSeconds: false,
    };
  } else {
    // <= 30m (e.g. 15m view)
    return {
      majorMs: 60_000,   // 1 min
      minorMs: 15_000,   // 15 sec
      showSeconds: true,
    };
  }
}
