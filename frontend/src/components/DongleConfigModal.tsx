import React, { useState } from 'react';
import { X, Sliders, RotateCw, Save } from 'lucide-react';

export interface DongleHardwareConfig {
  device_index?: number;
  ppm_offset?: number;
  rf_gain?: number;
  gain_mode?: string; // 'manual' | 'auto'
  bias_tee?: number; // 0 | 1
  direct_sampling?: number; // 0 | 1 | 2
  sample_rate?: number; // e.g. 2048000
  pre_roll_ms?: number; // e.g. 500
  hang_time_ms?: number; // e.g. 800
}

export interface DongleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: DongleHardwareConfig) => Promise<void> | void;
  onRestart?: () => Promise<void> | void;
  initialConfig?: DongleHardwareConfig;
}

// 29 standard R820T/R828D tuner gain steps in dB
export const R820T_GAIN_STEPS = [
  0.0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7, 16.6, 19.7, 20.7, 22.9,
  25.4, 28.0, 29.7, 32.8, 33.8, 36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5,
  48.0, 49.6,
];

export const DongleConfigModal: React.FC<DongleConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onRestart,
  initialConfig,
}) => {
  const [config, setConfig] = useState<DongleHardwareConfig>({
    device_index: initialConfig?.device_index ?? 0,
    ppm_offset: initialConfig?.ppm_offset ?? 0,
    rf_gain: initialConfig?.rf_gain ?? 38.6,
    gain_mode: initialConfig?.gain_mode ?? 'manual',
    bias_tee: initialConfig?.bias_tee ?? 0,
    direct_sampling: initialConfig?.direct_sampling ?? 0,
    sample_rate: initialConfig?.sample_rate ?? 2048000,
    pre_roll_ms: initialConfig?.pre_roll_ms ?? 500,
    hang_time_ms: initialConfig?.hang_time_ms ?? 800,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  if (!isOpen) return null;

  const handlePpmStep = (delta: number) => {
    setConfig((prev) => {
      const cur = prev.ppm_offset ?? 0;
      const next = Math.max(-100, Math.min(100, cur + delta));
      return { ...prev, ppm_offset: next };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(config);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestart = async () => {
    if (!onRestart) return;
    setIsRestarting(true);
    try {
      await onRestart();
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dongle-config-title"
    >
      <div className="w-full max-w-lg bg-obsidian border border-charcoal rounded-cards overflow-hidden shadow-sm flex flex-col my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal bg-ash/50">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-phosphor-green" />
            <h2 id="dongle-config-title" className="text-base font-medium text-snow">
              SDR Dongle Configuration
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-smoke hover:text-snow hover:bg-ash transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs">
          {/* Device Selection & PPM Calibration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="device_index" className="block text-smoke font-sans mb-1.5 font-medium">
                USB Device Index
              </label>
              <input
                id="device_index"
                type="number"
                min="0"
                max="8"
                value={config.device_index ?? 0}
                onChange={(e) =>
                  setConfig({ ...config, device_index: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-snow font-mono outline-none"
              />
              <span className="text-[10px] text-smoke mt-1 block">RTL2832U Dongle Index</span>
            </div>

            <div>
              <label htmlFor="ppm_offset" className="block text-smoke font-sans mb-1.5 font-medium">
                PPM Correction
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="ppm_offset"
                  type="number"
                  min="-100"
                  max="100"
                  value={config.ppm_offset ?? 0}
                  onChange={(e) =>
                    setConfig({ ...config, ppm_offset: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-2 py-2 text-snow font-mono text-center outline-none"
                />
                <button
                  type="button"
                  onClick={() => handlePpmStep(-1)}
                  className="px-2 py-2 bg-ash border border-slate hover:border-charcoal rounded-inputs text-silver-mist font-mono"
                  title="-1 PPM"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => handlePpmStep(1)}
                  className="px-2 py-2 bg-ash border border-slate hover:border-charcoal rounded-inputs text-silver-mist font-mono"
                  title="+1 PPM"
                >
                  +1
                </button>
              </div>
              <span className="text-[10px] text-smoke mt-1 block">Oscillator crystal error</span>
            </div>
          </div>

          {/* Tuner RF Gain Controls */}
          <div className="border border-charcoal rounded-inputs p-3 bg-ash/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-snow font-medium">Tuner RF Gain Mode</span>
              <div className="flex items-center gap-1 bg-obsidian border border-charcoal rounded-pill p-0.5">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, gain_mode: 'manual' })}
                  className={`px-3 py-1 rounded-pill text-[11px] font-medium transition-colors ${
                    config.gain_mode === 'manual'
                      ? 'bg-phosphor-green text-obsidian font-semibold'
                      : 'text-smoke hover:text-snow'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, gain_mode: 'auto' })}
                  className={`px-3 py-1 rounded-pill text-[11px] font-medium transition-colors ${
                    config.gain_mode === 'auto'
                      ? 'bg-phosphor-green text-obsidian font-semibold'
                      : 'text-smoke hover:text-snow'
                  }`}
                >
                  Auto AGC
                </button>
              </div>
            </div>

            {config.gain_mode === 'manual' && (
              <div>
                <div className="flex items-center justify-between mb-1.5 font-mono">
                  <label htmlFor="rf_gain_select" className="text-smoke text-[11px]">
                    Manual RF Gain (dB)
                  </label>
                  <span className="text-phosphor-green font-medium">
                    {config.rf_gain?.toFixed(1)} dB
                  </span>
                </div>
                <select
                  id="rf_gain_select"
                  value={config.rf_gain ?? 38.6}
                  onChange={(e) =>
                    setConfig({ ...config, rf_gain: parseFloat(e.target.value) })
                  }
                  className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-snow font-mono outline-none"
                >
                  {R820T_GAIN_STEPS.map((gain) => (
                    <option key={gain} value={gain}>
                      {gain.toFixed(1)} dB
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Bias-Tee & Direct Sampling */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bias_tee" className="block text-smoke font-sans mb-1.5 font-medium">
                Hardware 4.5V Bias-Tee
              </label>
              <select
                id="bias_tee"
                value={config.bias_tee ?? 0}
                onChange={(e) =>
                  setConfig({ ...config, bias_tee: parseInt(e.target.value, 10) })
                }
                className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-snow font-mono outline-none"
              >
                <option value={0}>Disabled (Off)</option>
                <option value={1}>Enabled (4.5V DC On)</option>
              </select>
              <span className="text-[10px] text-smoke mt-1 block">Active antenna / LNA power</span>
            </div>

            <div>
              <label htmlFor="direct_sampling" className="block text-smoke font-sans mb-1.5 font-medium">
                Direct Sampling Mode
              </label>
              <select
                id="direct_sampling"
                value={config.direct_sampling ?? 0}
                onChange={(e) =>
                  setConfig({ ...config, direct_sampling: parseInt(e.target.value, 10) })
                }
                className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-snow font-mono outline-none"
              >
                <option value={0}>Disabled (Quadrature VHF/UHF)</option>
                <option value={1}>I-branch (HF 0-24 MHz)</option>
                <option value={2}>Q-branch</option>
              </select>
              <span className="text-[10px] text-smoke mt-1 block">HF direct ADC mode</span>
            </div>
          </div>

          {/* Sample Rate & Audio Buffers */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="sample_rate" className="block text-smoke font-sans mb-1.5 font-medium">
                Sample Rate
              </label>
              <select
                id="sample_rate"
                value={config.sample_rate ?? 2048000}
                onChange={(e) =>
                  setConfig({ ...config, sample_rate: parseInt(e.target.value, 10) })
                }
                className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-2 py-2 text-snow font-mono outline-none"
              >
                <option value={1024000}>1.024 MS/s</option>
                <option value={2048000}>2.048 MS/s</option>
                <option value={2400000}>2.400 MS/s</option>
              </select>
            </div>

            <div>
              <label htmlFor="pre_roll" className="block text-smoke font-sans mb-1.5 font-medium">
                Pre-Roll Buffer
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="pre_roll"
                  type="number"
                  min="100"
                  max="2000"
                  step="50"
                  value={config.pre_roll_ms ?? 500}
                  onChange={(e) =>
                    setConfig({ ...config, pre_roll_ms: parseInt(e.target.value, 10) || 500 })
                  }
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-2 py-2 text-snow font-mono text-center outline-none"
                />
                <span className="text-[10px] text-smoke font-mono">ms</span>
              </div>
            </div>

            <div>
              <label htmlFor="hang_time" className="block text-smoke font-sans mb-1.5 font-medium">
                Hang Time Delay
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="hang_time"
                  type="number"
                  min="100"
                  max="3000"
                  step="50"
                  value={config.hang_time_ms ?? 800}
                  onChange={(e) =>
                    setConfig({ ...config, hang_time_ms: parseInt(e.target.value, 10) || 800 })
                  }
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-2 py-2 text-snow font-mono text-center outline-none"
                />
                <span className="text-[10px] text-smoke font-mono">ms</span>
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-charcoal flex items-center justify-between">
            {onRestart ? (
              <button
                type="button"
                onClick={handleRestart}
                disabled={isRestarting}
                className="flex items-center gap-1.5 px-3 py-2 text-silver-mist hover:text-snow border border-slate hover:border-charcoal rounded-pill transition-colors cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
                <span>Restart Tuner</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-smoke hover:text-snow rounded-pill transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-5 py-2 bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save & Apply'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
