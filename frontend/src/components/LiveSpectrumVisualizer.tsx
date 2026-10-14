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
  frequencyHz: _frequencyHz = 118200000,
  modulation: _modulation = 'AM',
  squelchOpen = false,
  rssi = -80.0,
  hardwareConnected = true,
  analyserNode = null,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const peakHoldRef = useRef<number[]>([]);
  const stateRef = useRef({
    squelchOpen,
    rssi,
    hardwareConnected,
    analyserNode,
  });

  // Keep stateRef fresh without tearing down animation loop
  useEffect(() => {
    stateRef.current = {
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

    let dataArray = new Uint8Array(128);

    const render = () => {
      const {
        squelchOpen: curSquelchOpen,
        rssi: curRssi,
        hardwareConnected: curHwConnected,
        analyserNode: curAnalyser,
      } = stateRef.current;

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#121212'; // Obsidian background
      ctx.fillRect(0, 0, width, height);

      // Subtle horizontal dB grid lines
      ctx.strokeStyle = '#242424';
      ctx.lineWidth = 1;
      for (let y = height * 0.25; y < height; y += height * 0.25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const numBars = 64;
      const displayData: number[] = new Array(numBars);

      if (!curHwConnected) {
        // Disconnected: Flat red line / stationary minimal bars, no movement
        for (let i = 0; i < numBars; i++) {
          displayData[i] = 0.04; // Flat static line at the bottom
        }
      } else {
        let hasRealAudio = false;
        if (curAnalyser) {
          if (dataArray.length !== curAnalyser.frequencyBinCount) {
            dataArray = new Uint8Array(curAnalyser.frequencyBinCount);
          }
          curAnalyser.getByteFrequencyData(dataArray);
          // Check if any bin has significant energy
          for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > 10) {
              hasRealAudio = true;
              break;
            }
          }
        }

        // If no real audio node data, generate realistic SDR RF spectrum based on squelch and RSSI
        if (hasRealAudio) {
          // Radio voice audio (AM/NFM) is concentrated in the speech formant range (~150Hz to ~4500Hz).
          // Higher FFT bins (> 4.5kHz) have virtually zero energy in radio speech.
          // We distribute the 64 bars across the active voice frequency bins using a log/perceptual curve
          // so all 64 bars animate dynamically across the entire width of the spectrum during playback.
          const maxVoiceBin = Math.min(
            dataArray.length - 1,
            Math.max(16, Math.floor(dataArray.length * 0.42))
          );
          for (let i = 0; i < numBars; i++) {
            const frac = i / (numBars - 1);
            const curvedFrac = Math.pow(frac, 1.3);
            const binIndex = Math.min(
              maxVoiceBin,
              Math.max(1, Math.round(curvedFrac * maxVoiceBin))
            );
            const bPrev = Math.max(0, binIndex - 1);
            const bNext = Math.min(dataArray.length - 1, binIndex + 1);
            const avgVal = (dataArray[bPrev] + dataArray[binIndex] * 2 + dataArray[bNext]) / 4;
            displayData[i] = Math.min(0.98, (avgVal / 255.0) * 1.25);
          }
        } else {
          // Base noise floor based on RSSI (-100 dBFS = ~0.08, -50 dBFS = ~0.25)
          const baseLevel = Math.max(0.04, Math.min(0.85, ((curRssi + 100) / 100) * 0.35));
          const time = Date.now() / 150;

          for (let i = 0; i < numBars; i++) {
            let val = baseLevel + Math.sin(i * 0.3 + time) * 0.03 + (Math.random() - 0.5) * 0.04;
            if (curSquelchOpen) {
              // Voice resonance formant peaks around the center
              const centerDist = Math.abs(i - numBars / 2) / (numBars / 2);
              const voiceBump =
                Math.max(0, 1 - centerDist * 1.5) * (0.45 + Math.sin(time * 2 + i * 0.5) * 0.2);
              val += voiceBump;
            }
            displayData[i] = Math.max(0.02, Math.min(0.95, val));
          }
        }
      }

      // Initialize or update peak hold
      if (peakHoldRef.current.length !== numBars) {
        peakHoldRef.current = new Array(numBars).fill(0);
      }

      // Draw Spectrum Bars
      const barSpacing = 2;
      const totalSpacing = barSpacing * (numBars - 1);
      const barWidth = Math.max(1, (width - totalSpacing) / numBars);

      for (let i = 0; i < numBars; i++) {
        const barHeight = displayData[i] * height;
        const x = i * (barWidth + barSpacing);
        const y = height - barHeight;

        // Peak decay
        if (!curHwConnected) {
          peakHoldRef.current[i] = displayData[i];
        } else {
          if (displayData[i] >= peakHoldRef.current[i]) {
            peakHoldRef.current[i] = displayData[i];
          } else {
            peakHoldRef.current[i] = Math.max(0, peakHoldRef.current[i] - 0.008);
          }
        }

        // Color bars: Red when disconnected, Phosphor green when connected
        if (!curHwConnected) {
          if (typeof ctx.createLinearGradient === 'function') {
            const gradient = ctx.createLinearGradient(0, y, 0, height);
            gradient.addColorStop(0, '#ef4444');
            gradient.addColorStop(0.6, '#b91c1c');
            gradient.addColorStop(1, '#7f1d1d');
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = '#ef4444';
          }
        } else {
          if (typeof ctx.createLinearGradient === 'function') {
            const gradient = ctx.createLinearGradient(0, y, 0, height);
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
        const peakY = height - peakHoldRef.current[i] * height;
        ctx.fillStyle = !curHwConnected ? '#ef4444' : '#00c573';
        ctx.fillRect(x, peakY - 1, barWidth, 1.5);
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
