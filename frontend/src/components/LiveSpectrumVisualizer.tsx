import React, { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';
import { useTheme, Theme } from '../context/ThemeContext';
import { useUiSettings, SpectrumColorMap, SpectrumFps, SpectrumDecay } from '../context/UiSettingsContext';

export interface LiveSpectrumVisualizerProps {
  frequencyHz?: number;
  modulation?: string;
  squelchOpen?: boolean;
  rssi?: number;
  hardwareConnected?: boolean;
  analyserNode?: AnalyserNode | null;
  theme?: Theme;
  colorMap?: SpectrumColorMap;
  fps?: SpectrumFps;
  decay?: SpectrumDecay;
  showPassband?: boolean;
  className?: string;
}

interface PaletteConfig {
  barGradientDark: [string, string, string];
  barGradientLight: [string, string, string];
  peakMarkerDark: string;
  peakMarkerLight: string;
  passbandFillDark: string;
  passbandFillLight: string;
  passbandStrokeDark: string;
  passbandStrokeLight: string;
  passbandTextDark: string;
  passbandTextLight: string;
  centerTickDark: string;
  centerTickLight: string;
  carrierActiveText: string;
}

const PALETTES: Record<SpectrumColorMap, PaletteConfig> = {
  phosphor: {
    barGradientDark: ['#3ecf8e', '#188656', '#0e4a30'],
    barGradientLight: ['#059669', '#10b981', '#6ee7b7'],
    peakMarkerDark: '#00c573',
    peakMarkerLight: '#047857',
    passbandFillDark: 'rgba(62, 207, 142, 0.05)',
    passbandFillLight: 'rgba(5, 150, 105, 0.08)',
    passbandStrokeDark: 'rgba(62, 207, 142, 0.22)',
    passbandStrokeLight: 'rgba(5, 150, 105, 0.3)',
    passbandTextDark: 'rgba(62, 207, 142, 0.7)',
    passbandTextLight: '#059669',
    centerTickDark: '#3ecf8e',
    centerTickLight: '#059669',
    carrierActiveText: 'text-phosphor-green',
  },
  cyan: {
    barGradientDark: ['#06b6d4', '#0891b2', '#164e63'],
    barGradientLight: ['#0891b2', '#06b6d4', '#67e8f9'],
    peakMarkerDark: '#22d3ee',
    peakMarkerLight: '#0e7490',
    passbandFillDark: 'rgba(6, 182, 212, 0.05)',
    passbandFillLight: 'rgba(8, 145, 178, 0.08)',
    passbandStrokeDark: 'rgba(6, 182, 212, 0.22)',
    passbandStrokeLight: 'rgba(8, 145, 178, 0.3)',
    passbandTextDark: 'rgba(6, 182, 212, 0.7)',
    passbandTextLight: '#0891b2',
    centerTickDark: '#06b6d4',
    centerTickLight: '#0891b2',
    carrierActiveText: 'text-cyan-400',
  },
  amber: {
    barGradientDark: ['#f59e0b', '#d97706', '#78350f'],
    barGradientLight: ['#d97706', '#f59e0b', '#fde68a'],
    peakMarkerDark: '#fbbf24',
    peakMarkerLight: '#b45309',
    passbandFillDark: 'rgba(245, 158, 11, 0.05)',
    passbandFillLight: 'rgba(217, 119, 6, 0.08)',
    passbandStrokeDark: 'rgba(245, 158, 11, 0.22)',
    passbandStrokeLight: 'rgba(217, 119, 6, 0.3)',
    passbandTextDark: 'rgba(245, 158, 11, 0.7)',
    passbandTextLight: '#d97706',
    centerTickDark: '#f59e0b',
    centerTickLight: '#d97706',
    carrierActiveText: 'text-amber-400',
  },
  monochrome: {
    barGradientDark: ['#e2e8f0', '#94a3b8', '#334155'],
    barGradientLight: ['#475569', '#64748b', '#cbd5e1'],
    peakMarkerDark: '#f8fafc',
    peakMarkerLight: '#1e293b',
    passbandFillDark: 'rgba(226, 232, 240, 0.05)',
    passbandFillLight: 'rgba(71, 85, 105, 0.08)',
    passbandStrokeDark: 'rgba(226, 232, 240, 0.22)',
    passbandStrokeLight: 'rgba(71, 85, 105, 0.3)',
    passbandTextDark: 'rgba(226, 232, 240, 0.7)',
    passbandTextLight: '#475569',
    centerTickDark: '#e2e8f0',
    centerTickLight: '#475569',
    carrierActiveText: 'text-slate-200',
  },
};

export const LiveSpectrumVisualizer: React.FC<LiveSpectrumVisualizerProps> = ({
  frequencyHz,
  modulation = 'NFM',
  squelchOpen = false,
  rssi = -100.0,
  hardwareConnected = true,
  analyserNode = null,
  theme: propTheme,
  colorMap,
  fps,
  decay,
  showPassband,
  className = '',
}) => {
  const themeContext = useTheme();
  const currentTheme = propTheme ?? themeContext.theme;
  const isLight = currentTheme === 'light';

  const { settings: uiSettings } = useUiSettings();
  const activeColorMap: SpectrumColorMap = colorMap ?? uiSettings.spectrumColorMap ?? 'phosphor';
  const activeFps: SpectrumFps = fps ?? uiSettings.spectrumFps ?? 30;
  const activeDecay: SpectrumDecay = decay ?? uiSettings.spectrumDecay ?? 'normal';
  const activeShowPassband: boolean = showPassband ?? uiSettings.spectrumPassband ?? true;

  const palette = PALETTES[activeColorMap] || PALETTES.phosphor;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const peakHoldRef = useRef<number[]>([]);
  const renderRef = useRef<() => void>();
  const stateRef = useRef({
    frequencyHz,
    modulation,
    squelchOpen,
    rssi,
    hardwareConnected,
    analyserNode,
    isLight,
    colorMap: activeColorMap,
    fps: activeFps,
    decay: activeDecay,
    showPassband: activeShowPassband,
  });

  // Keep stateRef fresh without tearing down animation loop
  useEffect(() => {
    stateRef.current = {
      frequencyHz,
      modulation,
      squelchOpen,
      rssi,
      hardwareConnected,
      analyserNode,
      isLight,
      colorMap: activeColorMap,
      fps: activeFps,
      decay: activeDecay,
      showPassband: activeShowPassband,
    };
    renderRef.current?.();
  }, [
    frequencyHz,
    modulation,
    squelchOpen,
    rssi,
    hardwareConnected,
    analyserNode,
    isLight,
    activeColorMap,
    activeFps,
    activeDecay,
    activeShowPassband,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dataArray = new Uint8Array(64);
    let lastRenderTime = 0;

    const render = (now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now()), force = false) => {
      const {
        frequencyHz: curFreq = 0,
        modulation: curMod = 'NFM',
        squelchOpen: curSquelchOpen,
        rssi: curRssi = -100.0,
        hardwareConnected: curHwConnected,
        analyserNode: curAnalyser,
        isLight: curIsLight,
        colorMap: curColorMap,
        fps: curFps,
        decay: curDecay,
        showPassband: curShowPassband,
      } = stateRef.current;

      const interval = 1000 / curFps;
      const delta = now - lastRenderTime;

      if (force || delta >= interval || lastRenderTime === 0) {
        lastRenderTime = now - (delta % interval);

        const width = canvas.width;
        const height = canvas.height;
        const rulerHeight = 22;
        const plotHeight = height - rulerHeight;
        const currentPalette = PALETTES[curColorMap] || PALETTES.phosphor;

        ctx.fillStyle = curIsLight ? '#f8fafc' : '#121212'; // Canvas background
        ctx.fillRect(0, 0, width, height);

        // Channel Filter Bandwidth Shading around center
        // NFM: 12.5 kHz, AM: 6.0 kHz, over a 100 kHz span (±50 kHz)
        if (curShowPassband) {
          const filterBwHz = curMod.toUpperCase().includes('AM') ? 6000 : 12500;
          const spanHz = 100000;
          const bwRatio = filterBwHz / spanHz;
          const bwWidth = width * bwRatio;
          const bwX1 = (width - bwWidth) / 2;

          ctx.fillStyle = curIsLight ? currentPalette.passbandFillLight : currentPalette.passbandFillDark;
          ctx.fillRect(bwX1, 0, bwWidth, plotHeight);
          ctx.strokeStyle = curIsLight ? currentPalette.passbandStrokeLight : currentPalette.passbandStrokeDark;
          if (typeof ctx.strokeRect === 'function') {
            ctx.strokeRect(bwX1, 0, bwWidth, plotHeight);
          }

          // Filter label at top of passband
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillStyle = curIsLight ? currentPalette.passbandTextLight : currentPalette.passbandTextDark;
          ctx.textAlign = 'center';
          ctx.fillText(`${(filterBwHz / 1000).toFixed(1)}k ${curMod}`, width / 2, 11);
        }

        // Horizontal dBFS grid lines & labels
        ctx.strokeStyle = curIsLight ? '#e2e8f0' : '#1e1e1e';
        ctx.lineWidth = 1;
        const dbMarks = [
          { label: '-20', y: plotHeight * 0.2 },
          { label: '-40', y: plotHeight * 0.4 },
          { label: '-60', y: plotHeight * 0.6 },
          { label: '-80', y: plotHeight * 0.8 },
        ];

        for (const m of dbMarks) {
          ctx.beginPath();
          ctx.moveTo(0, m.y);
          ctx.lineTo(width, m.y);
          ctx.stroke();

          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillStyle = curIsLight ? '#94a3b8' : '#404040';
          ctx.textAlign = 'left';
          ctx.fillText(m.label, 4, m.y - 2);
        }

        // Calculate RF Spectrum Bars centered at f0
        const numBars = 80;
        const centerIdx = Math.floor(numBars / 2);
        const displayData: number[] = new Array(numBars);
        const time = Date.now() / 150;

        if (!curHwConnected) {
          // Disconnected: Flat red line at bottom
          for (let i = 0; i < numBars; i++) {
            displayData[i] = 0.04;
          }
        } else {
          // Base noise floor based on RSSI (-100 dBFS = ~0.05, -50 dBFS = ~0.2)
          const baseLevel = Math.max(0.04, Math.min(0.22, ((curRssi + 100) / 100) * 0.25));

          let audioEnergy = 0;
          if (curAnalyser) {
            if (dataArray.length !== curAnalyser.frequencyBinCount) {
              dataArray = new Uint8Array(curAnalyser.frequencyBinCount);
            }
            curAnalyser.getByteFrequencyData(dataArray);
            let sum = 0;
            const count = Math.min(32, dataArray.length);
            for (let i = 0; i < count; i++) sum += dataArray[i];
            audioEnergy = sum / count / 255.0;
          }

          if (curSquelchOpen) {
            // Strong RF Carrier centered precisely at centerIdx (tuned frequency)
            const carrierPeak = Math.max(0.45, Math.min(0.95, (curRssi + 95) / 75));

            for (let i = 0; i < numBars; i++) {
              const dist = Math.abs(i - centerIdx);
              // Gaussian / Lorentzian RF peak envelope
              const carrierWeight = Math.exp(-Math.pow(dist / 3.4, 2));
              const voiceFlutter = Math.sin(time * 3 + i * 0.7) * 0.05 * audioEnergy;
              const noise = baseLevel + Math.sin(i * 0.4 + time) * 0.02 + (Math.random() - 0.5) * 0.025;
              const val = noise + (carrierPeak - noise) * carrierWeight + voiceFlutter * carrierWeight;
              displayData[i] = Math.max(0.02, Math.min(0.96, val));
            }
          } else {
            // Idle state: Flat noise floor with subtle RF ripple
            for (let i = 0; i < numBars; i++) {
              const noise = baseLevel + Math.sin(i * 0.5 + time) * 0.02 + (Math.random() - 0.5) * 0.03;
              displayData[i] = Math.max(0.02, Math.min(0.25, noise));
            }
          }
        }

        // Initialize or update peak hold
        if (peakHoldRef.current.length !== numBars) {
          peakHoldRef.current = new Array(numBars).fill(0);
        }

        // Draw Spectrum Bars
        const barSpacing = 1.5;
        const totalSpacing = barSpacing * (numBars - 1);
        const barWidth = Math.max(1, (width - totalSpacing) / numBars);

        const decayStep = curDecay === 'fast' ? 0.02 : curDecay === 'slow' ? 0.003 : curDecay === 'off' ? 1.0 : 0.009;

        for (let i = 0; i < numBars; i++) {
          const barHeight = displayData[i] * plotHeight;
          const x = i * (barWidth + barSpacing);
          const y = plotHeight - barHeight;

          // Peak decay
          if (!curHwConnected || curDecay === 'off') {
            peakHoldRef.current[i] = displayData[i];
          } else {
            if (displayData[i] >= peakHoldRef.current[i]) {
              peakHoldRef.current[i] = displayData[i];
            } else {
              peakHoldRef.current[i] = Math.max(0, peakHoldRef.current[i] - decayStep);
            }
          }

          // Color bars: Red when disconnected, Palette gradient when connected
          if (!curHwConnected) {
            ctx.fillStyle = '#ef4444';
          } else {
            const barG = curIsLight ? currentPalette.barGradientLight : currentPalette.barGradientDark;
            if (typeof ctx.createLinearGradient === 'function') {
              const gradient = ctx.createLinearGradient(0, y, 0, plotHeight);
              gradient.addColorStop(0, barG[0]);
              gradient.addColorStop(0.6, barG[1]);
              gradient.addColorStop(1, barG[2]);
              ctx.fillStyle = gradient;
            } else {
              ctx.fillStyle = barG[0];
            }
          }
          ctx.fillRect(x, y, barWidth, barHeight);

          // Peak hold marker (skip if decay is off)
          if (curDecay !== 'off') {
            const peakY = plotHeight - peakHoldRef.current[i] * plotHeight;
            ctx.fillStyle = !curHwConnected
              ? '#ef4444'
              : curIsLight
              ? currentPalette.peakMarkerLight
              : currentPalette.peakMarkerDark;
            ctx.fillRect(x, peakY - 1, barWidth, 1.5);
          }
        }

        // Bottom Frequency Axis Ruler (22px)
        ctx.fillStyle = curIsLight ? '#f1f5f9' : '#161616';
        ctx.fillRect(0, plotHeight, width, rulerHeight);

        ctx.strokeStyle = curIsLight ? '#e2e8f0' : '#282828';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, plotHeight);
        ctx.lineTo(width, plotHeight);
        ctx.stroke();

        // Frequency ruler ticks & labels
        ctx.font = '9px "JetBrains Mono", monospace';
        const f0MHz = curFreq / 1e6;
        const ticks = [
          { frac: 0.06, label: `${(f0MHz - 0.045).toFixed(4)}`, sub: '-45k' },
          { frac: 0.28, label: `${(f0MHz - 0.0225).toFixed(4)}`, sub: '-22.5k' },
          { frac: 0.50, label: `${f0MHz.toFixed(4)}`, isCenter: true },
          { frac: 0.72, label: `${(f0MHz + 0.0225).toFixed(4)}`, sub: '+22.5k' },
          { frac: 0.94, label: `${(f0MHz + 0.045).toFixed(4)}`, sub: '+45k' },
        ];

        for (const t of ticks) {
          const tx = t.frac * width;
          ctx.strokeStyle = t.isCenter
            ? curIsLight
              ? currentPalette.centerTickLight
              : currentPalette.centerTickDark
            : curIsLight
            ? '#cbd5e1'
            : '#383838';
          ctx.beginPath();
          ctx.moveTo(tx, plotHeight);
          ctx.lineTo(tx, plotHeight + (t.isCenter ? 6 : 4));
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.fillStyle = t.isCenter
            ? curIsLight
              ? currentPalette.centerTickLight
              : currentPalette.centerTickDark
            : curIsLight
            ? '#64748b'
            : '#888888';
          ctx.fillText(t.label, tx, plotHeight + 14);
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    const requestRender = () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      render(undefined, true);
    };

    renderRef.current = requestRender;
    requestRender();

    return () => {
      renderRef.current = undefined;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`bg-ash/70 border border-charcoal rounded-cards p-3 flex flex-col gap-2 select-none ${className}`}>
      {/* Visualizer Header */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Activity
            className={`w-3.5 h-3.5 ${
              !hardwareConnected
                ? 'text-red-500'
                : squelchOpen
                ? `${palette.carrierActiveText} animate-pulse`
                : 'text-smoke'
            }`}
          />
          <span className="text-snow font-medium tracking-tight">LIVE SDR SPECTRUM</span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {!hardwareConnected ? (
            <span className="text-red-400 font-medium">DISCONNECTED</span>
          ) : squelchOpen ? (
            <span className={`${palette.carrierActiveText} font-medium`}>CARRIER ACTIVE</span>
          ) : null}
        </div>
      </div>

      {/* Spectrum Canvas: Enlarged height (h-52 / 208px) */}
      <div className="w-full h-52 bg-obsidian rounded-inputs overflow-hidden border border-charcoal/60 relative">
        <canvas
          ref={canvasRef}
          data-testid="sdr-spectrum-canvas"
          width={800}
          height={208}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
};
