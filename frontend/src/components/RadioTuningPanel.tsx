import React, { useState, useRef, useEffect } from 'react';
import { SMeterBar } from './SMeterBar';
import { Radio, BookmarkCheck, MoreVertical, Edit2, Play, Trash2, X, AlertCircle } from 'lucide-react';
import { validateFrequency } from './SettingsModal';

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
  onUpdatePreset?: (preset: PresetItem) => void;
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
  onUpdatePreset,
  onDeletePreset,
  className = '',
}) => {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editingPreset, setEditingPreset] = useState<PresetItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Airband');
  const [editFreqMHz, setEditFreqMHz] = useState('118.200');
  const [editMod, setEditMod] = useState('AM');
  const [editError, setEditError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots popup on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModulationChange = (mod: string) => {
    onTune({ modulation: mod });
  };

  const handleSquelchChange = (threshold: number) => {
    onTune({ squelchThreshold: threshold });
  };

  const handleStartEdit = (p: PresetItem) => {
    setEditingPreset(p);
    setEditName(p.name);
    setEditCategory(p.category || 'General');
    setEditFreqMHz((p.frequency_hz / 1e6).toFixed(4));
    setEditMod(p.modulation);
    setEditError(null);
    setOpenMenuId(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPreset) return;
    const parsedMHz = parseFloat(editFreqMHz);
    const err = validateFrequency(parsedMHz, editCategory);
    if (err) {
      setEditError(err);
      return;
    }
    setEditError(null);
    const hz = !isNaN(parsedMHz) ? Math.round(parsedMHz * 1e6) : editingPreset.frequency_hz;

    const updated: PresetItem = {
      ...editingPreset,
      name: editName.trim() || editingPreset.name,
      category: editCategory,
      frequency_hz: hz,
      modulation: editMod,
    };

    if (onUpdatePreset) {
      onUpdatePreset(updated);
    }
    setEditingPreset(null);
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
        {/* Clean Read-Only Frequency Readout (No Buttons, No Badge) */}
        <div className="bg-ash border border-charcoal rounded-cards p-3.5 text-center">
          <div className="text-[11px] text-smoke uppercase tracking-wider mb-1 font-sans font-medium">
            Tuned Frequency
          </div>
          <div className="font-mono text-xl text-snow font-semibold tracking-tight">
            {formatFrequencyHz(frequencyHz)}
          </div>
          <div className="text-[11px] text-smoke font-mono mt-1">
            {(frequencyHz / 1e6).toFixed(4)} MHz · {modulation}
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
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[11px] text-smoke uppercase tracking-wider font-medium">
              Channel Presets
            </div>
          </div>

          {/* Edit Preset Inline Modal/Dialog */}
          {editingPreset && (
            <form onSubmit={handleSaveEdit} className="bg-ash border border-phosphor-green/40 rounded-inputs p-3 mb-3 space-y-2.5">
              <div className="text-xs font-medium text-snow flex items-center justify-between">
                <span>Edit Channel</span>
                <button
                  type="button"
                  onClick={() => setEditingPreset(null)}
                  className="text-smoke hover:text-snow"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {editError && (
                <div
                  className="flex items-center gap-1.5 p-2 rounded bg-red-950/40 border border-red-500/50 text-red-400 text-[11px] font-mono"
                  role="alert"
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                  <span>{editError}</span>
                </div>
              )}

              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Channel Name"
                className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-2 py-1 text-xs text-snow outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.001"
                  value={editFreqMHz}
                  onChange={(e) => setEditFreqMHz(e.target.value)}
                  placeholder="Freq (MHz)"
                  className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-2 py-1 text-xs text-snow font-mono outline-none"
                />
                <select
                  value={editMod}
                  onChange={(e) => setEditMod(e.target.value)}
                  className="bg-obsidian border border-slate rounded-inputs px-2 py-1 text-xs text-silver-mist outline-none"
                >
                  <option value="AM">AM</option>
                  <option value="NFM">NFM</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingPreset(null)}
                  className="px-2.5 py-1 text-xs text-smoke hover:text-snow"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          {/* Preset Items List */}
          <div className="space-y-1.5" ref={menuRef}>
            {presets.map((p) => {
              const isSelected = p.frequency_hz === frequencyHz && p.modulation === modulation;
              const isMenuOpen = openMenuId === p.id;

              return (
                <div
                  key={p.id ?? p.name}
                  className={`relative flex items-center justify-between p-2 rounded-inputs border transition-colors ${
                    isSelected
                      ? 'bg-ash border-phosphor-green/40 text-snow'
                      : 'bg-obsidian border-charcoal hover:border-slate text-silver-mist'
                  }`}
                >
                  {/* Preset Info */}
                  <div
                    className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                    onClick={() =>
                      onTune({
                        frequencyHz: p.frequency_hz,
                        modulation: p.modulation,
                        squelchThreshold: p.squelch_threshold ?? squelchThreshold,
                      })
                    }
                  >
                    <BookmarkCheck
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected ? 'text-phosphor-green' : 'text-smoke'
                      }`}
                    />
                    <div className="truncate">
                      <div className="text-xs font-medium truncate text-snow hover:text-phosphor-green transition-colors">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-smoke font-mono">
                        {(p.frequency_hz / 1e6).toFixed(3)} MHz · {p.modulation}
                      </div>
                    </div>
                  </div>

                  {/* Active Recording Pill & 3-Dots Button */}
                  <div className="flex items-center gap-1.5">
                    {isSelected && (
                      <span className="text-[10px] font-mono text-phosphor-green bg-phosphor-green/10 border border-phosphor-green/30 px-1.5 py-0.5 rounded-pill font-medium flex items-center gap-1">
                        ● RECORDING
                      </span>
                    )}

                    {/* 3-Dots Action Button */}
                    <div className="relative">
                      <button
                        type="button"
                        aria-label="Channel options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(isMenuOpen ? null : (p.id ?? null));
                        }}
                        className="p-1 rounded hover:bg-charcoal text-smoke hover:text-snow transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* 3-Dots Popup Dropdown Menu */}
                      {isMenuOpen && (
                        <div className="absolute right-0 top-6 w-36 bg-ash border border-charcoal rounded-inputs shadow-lg py-1 z-50 text-xs font-sans">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-silver-mist hover:text-snow hover:bg-charcoal text-left transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-smoke" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              onTune({
                                frequencyHz: p.frequency_hz,
                                modulation: p.modulation,
                                squelchThreshold: p.squelch_threshold ?? squelchThreshold,
                              });
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-silver-mist hover:text-phosphor-green hover:bg-charcoal text-left transition-colors cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 text-phosphor-green" />
                            <span>Activate (Aktif)</span>
                          </button>
                          {onDeletePreset && p.id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                onDeletePreset(p.id!);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-silver-mist hover:text-red-400 hover:bg-charcoal text-left transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
