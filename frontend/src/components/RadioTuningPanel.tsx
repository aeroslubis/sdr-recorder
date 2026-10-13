import React, { useState } from 'react';
import { SMeterBar } from './SMeterBar';
import { Radio, Plus, Trash2, BookmarkCheck } from 'lucide-react';

export interface PresetItem {
  id?: number;
  name: string;
  frequency_hz: number;
  modulation: string;
  squelch_threshold?: number | null;
  category?: string;
}

export interface RadioTuningPanelProps {
  frequencyHz: number;
  modulation: string;
  squelchThreshold: number;
  rssi?: number;
  squelchOpen?: boolean;
  rfGain?: number;
  ppmOffset?: number;
  presets?: PresetItem[];
  onTune: (params: {
    frequencyHz?: number;
    modulation?: string;
    squelchThreshold?: number;
    rfGain?: number;
    ppmOffset?: number;
  }) => void;
  onCreatePreset?: (preset: Omit<PresetItem, 'id'>) => void;
  onDeletePreset?: (presetId: number) => void;
  className?: string;
}

/** Format frequency in Hz into dotted format e.g. 118.200.000 Hz */
export function formatFrequencyHz(hz: number): string {
  const s = Math.round(hz).toString();
  if (s.length <= 3) return `${s} Hz`;
  if (s.length <= 6) {
    const khz = s.slice(0, -3);
    const remainder = s.slice(-3);
    return `${khz}.${remainder} Hz`;
  }
  const mhz = s.slice(0, -6);
  const khz = s.slice(-6, -3);
  const remainder = s.slice(-3);
  return `${mhz}.${khz}.${remainder} Hz`;
}

const DEFAULT_PRESETS: PresetItem[] = [
  { id: 1, name: 'Haneda Tower', frequency_hz: 118200000, modulation: 'AM', category: 'Airband' },
  { id: 2, name: 'Tokyo Approach', frequency_hz: 119100000, modulation: 'AM', category: 'Airband' },
  { id: 3, name: 'Marine Ch 16', frequency_hz: 156800000, modulation: 'NFM', category: 'Marine' },
  { id: 4, name: '2m Ham Calling', frequency_hz: 145000000, modulation: 'NFM', category: 'Ham' },
];

export const RadioTuningPanel: React.FC<RadioTuningPanelProps> = ({
  frequencyHz,
  modulation,
  squelchThreshold,
  rssi = -80.0,
  squelchOpen = false,
  rfGain = 38.6,
  ppmOffset = 0,
  presets = DEFAULT_PRESETS,
  onTune,
  onCreatePreset,
  onDeletePreset,
  className = '',
}) => {
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState('Airband');
  const [isEditingFreq, setIsEditingFreq] = useState(false);
  const [freqInputValue, setFreqInputValue] = useState((frequencyHz / 1e6).toFixed(4));

  const handleStep = (stepHz: number) => {
    const nextHz = Math.max(100000, Math.min(2000000000, frequencyHz + stepHz));
    onTune({ frequencyHz: nextHz });
  };

  const handleModulationChange = (mod: string) => {
    onTune({ modulation: mod });
  };

  const handleSquelchChange = (threshold: number) => {
    onTune({ squelchThreshold: threshold });
  };

  const handleFreqSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMHz = parseFloat(freqInputValue);
    if (!isNaN(parsedMHz)) {
      const nextHz = Math.round(parsedMHz * 1e6);
      if (nextHz >= 100000 && nextHz <= 2000000000) {
        onTune({ frequencyHz: nextHz });
      }
    }
    setIsEditingFreq(false);
  };

  const handleAddPresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    if (onCreatePreset) {
      onCreatePreset({
        name: newPresetName.trim(),
        frequency_hz: frequencyHz,
        modulation: modulation,
        squelch_threshold: squelchThreshold,
        category: newPresetCategory,
      });
    }
    setNewPresetName('');
    setShowAddPreset(false);
  };

  return (
    <aside
      className={`w-[280px] flex-shrink-0 bg-obsidian border-r border-charcoal flex flex-col h-full overflow-y-auto select-none ${className}`}
      aria-label="Radio Tuning Panel"
    >
      {/* Top Header */}
      <div className="p-4 border-b border-charcoal flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-phosphor-green" />
          <h2 className="text-sm font-medium text-snow">Tuning & Receiver</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-smoke">
          <span>Gain: <span className="text-silver-mist">{rfGain.toFixed(1)}dB</span></span>
          <span>·</span>
          <span>PPM: <span className="text-silver-mist">{ppmOffset > 0 ? `+${ppmOffset}` : ppmOffset}</span></span>
        </div>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Frequency Readout & Direct Edit */}
        <div className="bg-ash border border-charcoal rounded-cards p-3 text-center">
          <div className="text-[11px] text-smoke uppercase tracking-wider mb-1 font-sans">
            Tuned Frequency
          </div>

          {isEditingFreq ? (
            <form onSubmit={handleFreqSubmit} className="flex items-center gap-1.5 my-1">
              <input
                type="number"
                step="0.001"
                autoFocus
                value={freqInputValue}
                onChange={(e) => setFreqInputValue(e.target.value)}
                onBlur={handleFreqSubmit}
                className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-2 py-1 text-center font-mono text-base text-snow outline-none"
              />
              <span className="text-xs text-smoke font-mono">MHz</span>
            </form>
          ) : (
            <button
              onClick={() => {
                setFreqInputValue((frequencyHz / 1e6).toFixed(4));
                setIsEditingFreq(true);
              }}
              title="Click to manually enter frequency in MHz"
              className="font-mono text-xl text-snow font-medium hover:text-phosphor-green transition-colors cursor-pointer tracking-tight"
            >
              {formatFrequencyHz(frequencyHz)}
            </button>
          )}

          <div className="text-[10px] text-smoke font-mono mt-0.5">
            {(frequencyHz / 1e6).toFixed(4)} MHz
          </div>
        </div>

        {/* Quick Step Buttons */}
        <div>
          <div className="text-[11px] text-smoke uppercase tracking-wider mb-2 font-medium">
            Frequency Step
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleStep(-1000000)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              -1M
            </button>
            <button
              type="button"
              onClick={() => handleStep(1000000)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              +1M
            </button>
            <button
              type="button"
              onClick={() => handleStep(-100000)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              -100k
            </button>
            <button
              type="button"
              onClick={() => handleStep(100000)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              +100k
            </button>
            <button
              type="button"
              onClick={() => handleStep(-25000)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              -25k
            </button>
            <button
              type="button"
              onClick={() => handleStep(25000)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              +25k
            </button>
            <button
              type="button"
              onClick={() => handleStep(-8333)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              -8.33k
            </button>
            <button
              type="button"
              onClick={() => handleStep(8333)}
              className="py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs transition-colors text-center"
            >
              +8.33k
            </button>
          </div>
        </div>

        {/* Modulation Mode Selector */}
        <div>
          <div className="text-[11px] text-smoke uppercase tracking-wider mb-2 font-medium">
            Demodulation Mode
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleModulationChange('AM')}
              className={`py-2 px-3 rounded-inputs font-medium transition-colors border ${
                modulation.toUpperCase() === 'AM'
                  ? 'bg-ash text-phosphor-green border-phosphor-green/50'
                  : 'bg-obsidian text-silver-mist border-charcoal hover:border-slate'
              }`}
            >
              AM (Airband)
            </button>
            <button
              type="button"
              onClick={() => handleModulationChange('NFM')}
              className={`py-2 px-3 rounded-inputs font-medium transition-colors border ${
                modulation.toUpperCase() === 'NFM'
                  ? 'bg-ash text-phosphor-green border-phosphor-green/50'
                  : 'bg-obsidian text-silver-mist border-charcoal hover:border-slate'
              }`}
            >
              NFM (VHF/UHF)
            </button>
          </div>
        </div>

        {/* S-Meter & Squelch Bar */}
        <div>
          <div className="text-[11px] text-smoke uppercase tracking-wider mb-1.5 font-medium">
            Signal & Squelch
          </div>
          <SMeterBar
            rssi={rssi}
            squelchThreshold={squelchThreshold}
            squelchOpen={squelchOpen}
            onSquelchChange={handleSquelchChange}
          />
        </div>

        {/* Channel Presets List */}
        <div className="pt-2 border-t border-charcoal">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-smoke uppercase tracking-wider font-medium">
              Channel Presets
            </div>
            <button
              type="button"
              onClick={() => setShowAddPreset(!showAddPreset)}
              className="flex items-center gap-1 text-[11px] text-silver-mist hover:text-phosphor-green transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Preset</span>
            </button>
          </div>

          {/* Add Preset Form */}
          {showAddPreset && (
            <form onSubmit={handleAddPresetSubmit} className="bg-ash border border-charcoal rounded-inputs p-2.5 mb-2.5 space-y-2">
              <input
                type="text"
                placeholder="Preset name (e.g. Tower)"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                autoFocus
                className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-2 py-1 text-xs text-snow outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <select
                  value={newPresetCategory}
                  onChange={(e) => setNewPresetCategory(e.target.value)}
                  className="bg-obsidian border border-slate rounded-inputs px-2 py-1 text-[11px] text-silver-mist outline-none"
                >
                  <option value="Airband">Airband</option>
                  <option value="Marine">Marine</option>
                  <option value="Ham">Ham</option>
                  <option value="General">General</option>
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowAddPreset(false)}
                    className="px-2 py-1 text-[11px] text-smoke hover:text-snow"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-[11px] bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Preset Items List */}
          <div className="space-y-1.5">
            {presets.map((p) => {
              const isSelected = p.frequency_hz === frequencyHz && p.modulation === modulation;
              return (
                <div
                  key={p.id ?? p.name}
                  className={`group flex items-center justify-between p-2 rounded-inputs border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-ash border-phosphor-green/40 text-snow'
                      : 'bg-obsidian border-charcoal hover:border-slate text-silver-mist'
                  }`}
                  onClick={() =>
                    onTune({
                      frequencyHz: p.frequency_hz,
                      modulation: p.modulation,
                      squelchThreshold: p.squelch_threshold ?? squelchThreshold,
                    })
                  }
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <BookmarkCheck
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected ? 'text-phosphor-green' : 'text-smoke'
                      }`}
                    />
                    <div className="truncate">
                      <div className="text-xs font-medium truncate text-snow group-hover:text-phosphor-green transition-colors">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-smoke font-mono">
                        {(p.frequency_hz / 1e6).toFixed(3)} MHz · {p.modulation}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {p.category && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-ash text-smoke border border-charcoal">
                        {p.category}
                      </span>
                    )}
                    {onDeletePreset && p.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePreset(p.id!);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-smoke hover:text-red-400 p-1 transition-opacity"
                        title="Delete preset"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
};
