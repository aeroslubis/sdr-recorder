import React, { useEffect, useRef } from 'react';
import { Activity } from 'lucide-react';

export interface LiveSpectrumVisualizerProps {
  frequencyHz?: number;
  modulation?: string;
  squelchOpen?: boolean;
  rssi?: number;
  hardwareConnected?: boolean;
  analyserNode?: AnalyserNode | null;
  className?: string;
}

export const LiveSpectrumVisualizer: React.FC<LiveSpectrumVisualizerProps> = ({
  frequencyHz,
  modulation = 'NFM',
  squelchOpen = false,
  rssi = -100.0,
  hardwareConnected = true,
  analyserNode = null,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const peakHoldRef = useRef<number[]>([]);
  const stateRef = useRef({
    frequencyHz,
    modulation,
    squelchOpen,
    rssi,
    hardwareConnected,
    analyserNode,
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
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dataArray = new Uint8Array(64);

    const render = () => {
      const {
        frequencyHz: curFreq = 0,
        modulation: curMod = 'NFM',
        squelchOpen: curSquelchOpen,
        rssi: curRssi = -100.0,
        hardwareConnected: curHwConnected,
        analyserNode: curAnalyser,
      } = stateRef.current;

      const width = canvas.width;
      const height = canvas.height;
      const rulerHeight = 22;
      const plotHeight = height - rulerHeight;

      ctx.fillStyle = '#121212'; // Obsidian background
      ctx.fillRect(0, 0, width, height);

      // Channel Filter Bandwidth Shading around center
      // NFM: 12.5 kHz, AM: 6.0 kHz, over a 100 kHz span (±50 kHz)
      const filterBwHz = curMod.toUpperCase().includes('AM') ? 6000 : 12500;
      const spanHz = 100000;
      const bwRatio = filterBwHz / spanHz;
      const bwWidth = width * bwRatio;
      const bwX1 = (width - bwWidth) / 2;

      ctx.fillStyle = 'rgba(62, 207, 142, 0.05)';
      ctx.fillRect(bwX1, 0, bwWidth, plotHeight);
      ctx.strokeStyle = 'rgba(62, 207, 142, 0.22)';
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeRect(bwX1, 0, bwWidth, plotHeight);
      }

      // Filter label at top of passband
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(62, 207, 142, 0.6)';
      ctx.textAlign = 'center';
      ctx.fillText(`${(filterBwHz / 1000).toFixed(1)}k ${curMod}`, width / 2, 11);

      // Horizontal dBFS grid lines & labels
      ctx.strokeStyle = '#1e1e1e';
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
        ctx.fillStyle = '#404040';
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

      for (let i = 0; i < numBars; i++) {
        const barHeight = displayData[i] * plotHeight;
        const x = i * (barWidth + barSpacing);
        const y = plotHeight - barHeight;

        // Peak decay
        if (!curHwConnected) {
          peakHoldRef.current[i] = displayData[i];
        } else {
          if (displayData[i] >= peakHoldRef.current[i]) {
            peakHoldRef.current[i] = displayData[i];
          } else {
            peakHoldRef.current[i] = Math.max(0, peakHoldRef.current[i] - 0.009);
          }
        }

        // Color bars: Red when disconnected, Phosphor green when connected
        if (!curHwConnected) {
          ctx.fillStyle = '#ef4444';
        } else {
          if (typeof ctx.createLinearGradient === 'function') {
            const gradient = ctx.createLinearGradient(0, y, 0, plotHeight);
            gradient.addColorStop(0, '#3ecf8e');
            gradient.addColorStop(0.6, '#188656');
            gradient.addColorStop(1, '#0e4a30');
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = '#3ecf8e';
          }
        }
        ctx.fillRect(x, y, barWidth, barHeight);

        // Peak hold marker
        const peakY = plotHeight - peakHoldRef.current[i] * plotHeight;
        ctx.fillStyle = !curHwConnected ? '#ef4444' : '#00c573';
        ctx.fillRect(x, peakY - 1, barWidth, 1.5);
      }

      // Center Tuning Needle (Down exact center of carrier)
      const centerX = width / 2;
      ctx.strokeStyle = !curHwConnected ? '#ef4444' : '#3ecf8e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, plotHeight);
      ctx.stroke();

      // Triangle marker ▼ at top
      ctx.fillStyle = !curHwConnected ? '#ef4444' : '#3ecf8e';
      ctx.beginPath();
      ctx.moveTo(centerX - 4, 0);
      ctx.lineTo(centerX + 4, 0);
      ctx.lineTo(centerX, 6);
      ctx.closePath();
      ctx.fill();

      // Bottom Frequency Axis Ruler (22px)
      ctx.fillStyle = '#161616';
      ctx.fillRect(0, plotHeight, width, rulerHeight);

      ctx.strokeStyle = '#282828';
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
        { frac: 0.50, label: `${f0MHz.toFixed(4)} MHz (f₀)`, isCenter: true },
        { frac: 0.72, label: `${(f0MHz + 0.0225).toFixed(4)}`, sub: '+22.5k' },
        { frac: 0.94, label: `${(f0MHz + 0.045).toFixed(4)}`, sub: '+45k' },
      ];

      for (const t of ticks) {
        const tx = t.frac * width;
        ctx.strokeStyle = t.isCenter ? '#3ecf8e' : '#383838';
        ctx.beginPath();
        ctx.moveTo(tx, plotHeight);
        ctx.lineTo(tx, plotHeight + (t.isCenter ? 6 : 4));
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = t.isCenter ? '#3ecf8e' : '#888888';
        ctx.fillText(t.label, tx, plotHeight + 14);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
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
                ? 'text-phosphor-green animate-pulse'
                : 'text-smoke'
            }`}
          />
          <span className="text-snow font-medium tracking-tight">LIVE SDR SPECTRUM</span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {!hardwareConnected ? (
            <span className="text-red-400 font-medium">DISCONNECTED</span>
          ) : (
            <>
              {squelchOpen && (
                <>
                  <span className="text-phosphor-green font-medium">CARRIER ACTIVE</span>
                  <span className="text-smoke">·</span>
                </>
              )}
              <span className="text-silver-mist">
                {rssi.toFixed(1)} <span className="text-smoke">dBFS</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Spectrum Canvas: Taller height (h-36 / 144px) */}
      <div className="w-full h-36 bg-obsidian rounded-inputs overflow-hidden border border-charcoal/60 relative">
        <canvas
          ref={canvasRef}
          data-testid="sdr-spectrum-canvas"
          width={800}
          height={144}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
};
