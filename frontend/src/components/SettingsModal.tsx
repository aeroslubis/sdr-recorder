import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Radio,
  HardDrive,
  KeyRound,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import { PresetItem } from './RadioTuningPanel';
import { DongleHardwareConfig, R820T_GAIN_STEPS } from './DongleConfigModal';

export type SettingsTab = 'dongle' | 'channels' | 'storage' | 'password';

export interface StorageSettings {
  retention_days: number;
  max_disk_usage_percent: number;
  audio_format: string;
}

export interface DeviceItem {
  index: number;
  name: string;
  available: boolean;
}

export interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  onSaveDongle: (config: DongleHardwareConfig) => Promise<void> | void;
  onSaveStorage: (settings: StorageSettings) => Promise<void> | void;
  onChangePassword: (passwords: {
    old_password: string;
    new_password: string;
  }) => Promise<{ success: boolean; error?: string } | void> | void;
  presets?: PresetItem[];
  onSavePreset?: (preset: Omit<PresetItem, 'id'> | PresetItem) => void;
  onDeletePreset?: (presetId: number) => void;
  initialDongleConfig?: DongleHardwareConfig;
  initialStorageSettings?: StorageSettings;
  diskUsedGB?: number;
  diskTotalGB?: number;
  className?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab = 'dongle',
  onClose,
  onSaveDongle,
  onSaveStorage,
  onChangePassword,
  presets = [],
  onSavePreset,
  onDeletePreset,
  initialDongleConfig,
  initialStorageSettings,
  diskUsedGB = 14.8,
  diskTotalGB = 100.0,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Sync tab if initialTab changes when opening
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  // Devices enumeration
  const [devices, setDevices] = useState<DeviceItem[]>([
    { index: 0, name: 'Default RTL-SDR / Simulator', available: true },
  ]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/radio/devices')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setDevices(data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Tab 1: Dongle Configuration State
  const [dongleConfig, setDongleConfig] = useState<DongleHardwareConfig>({
    device_index: initialDongleConfig?.device_index ?? 0,
    ppm_offset: initialDongleConfig?.ppm_offset ?? 0,
    rf_gain: initialDongleConfig?.rf_gain ?? 38.6,
    gain_mode: initialDongleConfig?.gain_mode ?? 'manual',
    bias_tee: initialDongleConfig?.bias_tee ?? 0,
    direct_sampling: initialDongleConfig?.direct_sampling ?? 0,
    sample_rate: initialDongleConfig?.sample_rate ?? 2048000,
    pre_roll_ms: initialDongleConfig?.pre_roll_ms ?? 500,
    hang_time_ms: initialDongleConfig?.hang_time_ms ?? 800,
  });

  const [dongleSaving, setDongleSaving] = useState(false);
  const [dongleSaved, setDongleSaved] = useState(false);

  // Tab 2: Channel Presets Manager State
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [presetForm, setPresetForm] = useState({
    name: '',
    frequencyMHz: '118.200',
    modulation: 'AM',
    category: 'Airband',
    squelch_threshold: -42.0,
  });

  // Tab 3: Storage Settings State
  const [storageSettings, setStorageSettings] = useState<StorageSettings>({
    retention_days: initialStorageSettings?.retention_days ?? 14,
    max_disk_usage_percent: initialStorageSettings?.max_disk_usage_percent ?? 90,
    audio_format: initialStorageSettings?.audio_format ?? 'opus',
  });
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageSaved, setStorageSaved] = useState(false);

  // Tab 4: Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
  }>({ type: 'idle' });

  if (!isOpen) return null;

  // Handlers
  const handlePpmStep = (delta: number) => {
    setDongleConfig((prev) => {
      const cur = prev.ppm_offset ?? 0;
      return { ...prev, ppm_offset: Math.max(-100, Math.min(100, cur + delta)) };
    });
  };

  const handleSaveDongleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDongleSaving(true);
    try {
      await onSaveDongle(dongleConfig);
      setDongleSaved(true);
      setTimeout(() => setDongleSaved(false), 2500);
    } finally {
      setDongleSaving(false);
    }
  };

  const handleSaveStorageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStorageSaving(true);
    try {
      await onSaveStorage(storageSettings);
      setStorageSaved(true);
      setTimeout(() => setStorageSaved(false), 2500);
    } finally {
      setStorageSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordStatus({ type: 'error', message: 'Current password is required.' });
      return;
    }
    if (newPassword.length < 5) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 5 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }

    setPasswordStatus({ type: 'loading' });
    try {
      const res = await onChangePassword({
        old_password: currentPassword,
        new_password: newPassword,
      });
      if (res && res.error) {
        setPasswordStatus({ type: 'error', message: res.error });
      } else {
        setPasswordStatus({ type: 'success', message: 'Password changed successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setPasswordStatus({ type: 'error', message: err?.message || 'Failed to change password.' });
    }
  };

  const handleAddChannelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetForm.name.trim()) return;
    const freqHz = Math.round(parseFloat(presetForm.frequencyMHz) * 1e6);

    if (onSavePreset) {
      onSavePreset({
        name: presetForm.name.trim(),
        frequency_hz: freqHz,
        modulation: presetForm.modulation,
        category: presetForm.category,
        squelch_threshold: presetForm.squelch_threshold,
      });
    }

    setPresetForm({
      name: '',
      frequencyMHz: '118.200',
      modulation: 'AM',
      category: 'Airband',
      squelch_threshold: -42.0,
    });
    setShowAddPreset(false);
  };

  const diskPercent = Math.min(100, Math.round((diskUsedGB / (diskTotalGB || 1)) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className={`w-full max-w-2xl bg-obsidian border border-charcoal rounded-cards overflow-hidden shadow-2xl flex flex-col my-8 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal bg-ash/50">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-phosphor-green" />
            <h2 id="settings-dialog-title" className="text-base font-medium text-snow">
              Settings & Configuration
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-inputs text-smoke hover:text-snow hover:bg-charcoal transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Tabs Bar */}
        <div className="flex items-center border-b border-charcoal bg-ash/30 px-6 overflow-x-auto" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'dongle'}
            onClick={() => setActiveTab('dongle')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'dongle'
                ? 'border-phosphor-green text-phosphor-green'
                : 'border-transparent text-silver-mist hover:text-snow'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Dongle</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'channels'}
            onClick={() => setActiveTab('channels')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'channels'
                ? 'border-phosphor-green text-phosphor-green'
                : 'border-transparent text-silver-mist hover:text-snow'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Channel Setup</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'storage'}
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'storage'
                ? 'border-phosphor-green text-phosphor-green'
                : 'border-transparent text-silver-mist hover:text-snow'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'password'}
            onClick={() => setActiveTab('password')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'password'
                ? 'border-phosphor-green text-phosphor-green'
                : 'border-transparent text-silver-mist hover:text-snow'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Password</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {/* TAB 1: DONGLE */}
          {activeTab === 'dongle' && (
            <form onSubmit={handleSaveDongleSubmit} className="space-y-5">
              {/* Device Selector */}
              <div>
                <label className="block text-xs font-medium text-silver-mist mb-1.5">
                  Detected SDR Device
                </label>
                <select
                  value={dongleConfig.device_index ?? 0}
                  onChange={(e) =>
                    setDongleConfig({ ...dongleConfig, device_index: parseInt(e.target.value, 10) })
                  }
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-xs text-snow outline-none"
                >
                  {devices.map((d) => (
                    <option key={d.index} value={d.index}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-smoke mt-1 font-mono">
                  Real-time USB device enumeration from rtl_test binary.
                </p>
              </div>

              {/* Crystal Calibration PPM */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="ppm-input" className="text-xs font-medium text-silver-mist">
                    Frequency Calibration (PPM Correction)
                  </label>
                  <span className="text-xs font-mono text-phosphor-green">
                    {(dongleConfig.ppm_offset ?? 0) > 0 ? `+${dongleConfig.ppm_offset}` : dongleConfig.ppm_offset} PPM
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="ppm-input"
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={dongleConfig.ppm_offset ?? 0}
                    onChange={(e) =>
                      setDongleConfig({ ...dongleConfig, ppm_offset: parseInt(e.target.value, 10) })
                    }
                    className="flex-1 accent-phosphor-green cursor-pointer"
                  />
                  <div className="flex items-center gap-1 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => handlePpmStep(-5)}
                      className="px-2 py-1 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs"
                    >
                      -5
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePpmStep(-1)}
                      className="px-2 py-1 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePpmStep(1)}
                      className="px-2 py-1 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePpmStep(5)}
                      className="px-2 py-1 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-inputs"
                    >
                      +5
                    </button>
                  </div>
                </div>
              </div>

              {/* RF Gain Mode & Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-silver-mist">
                    RF Gain Control & Level
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-silver-mist cursor-pointer">
                      <input
                        type="radio"
                        name="gain_mode"
                        checked={dongleConfig.gain_mode === 'manual'}
                        onChange={() => setDongleConfig({ ...dongleConfig, gain_mode: 'manual' })}
                        className="accent-phosphor-green"
                      />
                      <span>Manual</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-silver-mist cursor-pointer">
                      <input
                        type="radio"
                        name="gain_mode"
                        checked={dongleConfig.gain_mode === 'auto'}
                        onChange={() => setDongleConfig({ ...dongleConfig, gain_mode: 'auto' })}
                        className="accent-phosphor-green"
                      />
                      <span>Auto AGC</span>
                    </label>
                  </div>
                </div>

                {dongleConfig.gain_mode === 'manual' ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max={R820T_GAIN_STEPS.length - 1}
                      step="1"
                      value={R820T_GAIN_STEPS.indexOf(dongleConfig.rf_gain ?? 38.6) >= 0 ? R820T_GAIN_STEPS.indexOf(dongleConfig.rf_gain ?? 38.6) : 21}
                      onChange={(e) => {
                        const idx = parseInt(e.target.value, 10);
                        setDongleConfig({ ...dongleConfig, rf_gain: R820T_GAIN_STEPS[idx] });
                      }}
                      className="flex-1 accent-phosphor-green cursor-pointer"
                    />
                    <span className="font-mono text-xs text-phosphor-green w-16 text-right">
                      {(dongleConfig.rf_gain ?? 38.6).toFixed(1)} dB
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-ash border border-charcoal rounded-inputs text-xs text-smoke font-mono">
                    Hardware Automatic Gain Control (AGC) enabled.
                  </div>
                )}
              </div>

              {/* Bias-Tee & Direct Sampling */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-silver-mist mb-1.5">
                    Hardware 4.5V Bias-Tee
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDongleConfig({
                        ...dongleConfig,
                        bias_tee: dongleConfig.bias_tee === 1 ? 0 : 1,
                      })
                    }
                    className={`w-full py-2 px-3 rounded-inputs border text-xs font-mono transition-colors cursor-pointer ${
                      dongleConfig.bias_tee === 1
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300 font-medium'
                        : 'bg-ash border-charcoal text-silver-mist'
                    }`}
                  >
                    {dongleConfig.bias_tee === 1 ? '● BIAS-TEE ACTIVE (4.5V)' : 'BIAS-TEE OFF'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-silver-mist mb-1.5">
                    Direct Sampling Mode
                  </label>
                  <select
                    value={dongleConfig.direct_sampling ?? 0}
                    onChange={(e) =>
                      setDongleConfig({
                        ...dongleConfig,
                        direct_sampling: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-xs text-snow outline-none"
                  >
                    <option value={0}>Disabled (24 - 1766 MHz)</option>
                    <option value={1}>I-branch Enabled (HF 0-24 MHz)</option>
                    <option value={2}>Q-branch Enabled (HF 0-24 MHz)</option>
                  </select>
                </div>
              </div>

              {/* Squelch Buffers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-silver-mist mb-1.5">
                    Pre-Roll Ring Buffer
                  </label>
                  <select
                    value={dongleConfig.pre_roll_ms ?? 500}
                    onChange={(e) =>
                      setDongleConfig({ ...dongleConfig, pre_roll_ms: parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-ash border border-slate rounded-inputs px-3 py-2 text-xs text-snow outline-none font-mono"
                  >
                    <option value={200}>200 ms</option>
                    <option value={500}>500 ms (Recommended)</option>
                    <option value={1000}>1000 ms</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-silver-mist mb-1.5">
                    Squelch Hang Time
                  </label>
                  <select
                    value={dongleConfig.hang_time_ms ?? 800}
                    onChange={(e) =>
                      setDongleConfig({ ...dongleConfig, hang_time_ms: parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-ash border border-slate rounded-inputs px-3 py-2 text-xs text-snow outline-none font-mono"
                  >
                    <option value={500}>500 ms</option>
                    <option value={800}>800 ms (Standard)</option>
                    <option value={1500}>1500 ms</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-charcoal">
                {dongleSaved && (
                  <span className="text-xs text-phosphor-green flex items-center gap-1.5 font-mono">
                    <Check className="w-3.5 h-3.5" />
                    <span>Configuration saved and applied.</span>
                  </span>
                )}
                {!dongleSaved && <span />}

                <button
                  type="submit"
                  disabled={dongleSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors text-xs cursor-pointer ml-auto"
                >
                  <Save className="w-4 h-4" />
                  <span>{dongleSaving ? 'Applying...' : 'Apply & Reconfigure Dongle'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CHANNELS */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-snow">Radio Channel Presets</h3>
                  <p className="text-xs text-smoke">Manage saved radio frequencies and modulation presets.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddPreset(!showAddPreset)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ash border border-charcoal hover:border-slate text-silver-mist hover:text-snow rounded-pill text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-phosphor-green" />
                  <span>Add New Channel</span>
                </button>
              </div>

              {/* Add New Channel Form */}
              {showAddPreset && (
                <form onSubmit={handleAddChannelSubmit} className="bg-ash border border-charcoal rounded-cards p-4 space-y-3">
                  <div className="text-xs font-semibold text-snow">Add Channel Preset</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-silver-mist mb-1">Channel Name</label>
                      <input
                        type="text"
                        required
                        value={presetForm.name}
                        onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })}
                        placeholder="e.g. Tower 1"
                        className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-2.5 py-1.5 text-xs text-snow outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-silver-mist mb-1">Frequency (MHz)</label>
                      <input
                        type="number"
                        step="0.001"
                        required
                        value={presetForm.frequencyMHz}
                        onChange={(e) => setPresetForm({ ...presetForm, frequencyMHz: e.target.value })}
                        className="w-full bg-obsidian border border-slate focus:border-phosphor-green rounded-inputs px-2.5 py-1.5 text-xs text-snow font-mono outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-silver-mist mb-1">Modulation</label>
                      <select
                        value={presetForm.modulation}
                        onChange={(e) => setPresetForm({ ...presetForm, modulation: e.target.value })}
                        className="w-full bg-obsidian border border-slate rounded-inputs px-2.5 py-1.5 text-xs text-snow outline-none"
                      >
                        <option value="AM">AM</option>
                        <option value="NFM">NFM</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-silver-mist mb-1">Category</label>
                      <select
                        value={presetForm.category}
                        onChange={(e) => setPresetForm({ ...presetForm, category: e.target.value })}
                        className="w-full bg-obsidian border border-slate rounded-inputs px-2.5 py-1.5 text-xs text-snow outline-none"
                      >
                        <option value="Airband">Airband</option>
                        <option value="Marine">Marine</option>
                        <option value="Ham">Ham</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-silver-mist mb-1">Squelch Threshold</label>
                      <input
                        type="number"
                        step="1"
                        value={presetForm.squelch_threshold}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            squelch_threshold: parseFloat(e.target.value) || -42,
                          })
                        }
                        className="w-full bg-obsidian border border-slate rounded-inputs px-2.5 py-1.5 text-xs text-snow font-mono outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddPreset(false)}
                      className="px-3 py-1.5 text-xs text-smoke hover:text-snow"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 text-xs bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors"
                    >
                      Save Channel
                    </button>
                  </div>
                </form>
              )}

              {/* Presets Table */}
              <div className="border border-charcoal rounded-inputs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ash text-smoke font-mono text-[11px] border-b border-charcoal">
                    <tr>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Frequency</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal font-mono">
                    {presets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-smoke">
                          No presets configured.
                        </td>
                      </tr>
                    ) : (
                      presets.map((p) => (
                        <tr key={p.id ?? p.name} className="hover:bg-ash/40">
                          <td className="py-2.5 px-3 text-snow font-sans font-medium">{p.name}</td>
                          <td className="py-2.5 px-3 text-silver-mist">
                            {(p.frequency_hz / 1e6).toFixed(3)} MHz
                          </td>
                          <td className="py-2.5 px-3 text-silver-mist">{p.modulation}</td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ash text-smoke border border-charcoal font-sans">
                              {p.category || 'General'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {onDeletePreset && p.id && (
                              <button
                                type="button"
                                onClick={() => onDeletePreset(p.id!)}
                                className="text-smoke hover:text-red-400 p-1 transition-colors"
                                title="Delete Channel"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: STORAGE */}
          {activeTab === 'storage' && (
            <form onSubmit={handleSaveStorageSubmit} className="space-y-5">
              {/* Storage Stats Bar */}
              <div className="bg-ash border border-charcoal rounded-cards p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-silver-mist">Current Storage Status</span>
                  <span className="text-snow">
                    {diskUsedGB.toFixed(1)} GB / {diskTotalGB.toFixed(1)} GB ({diskPercent}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-obsidian rounded-full overflow-hidden border border-charcoal">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      diskPercent > 90
                        ? 'bg-red-400'
                        : diskPercent > 75
                        ? 'bg-amber-400'
                        : 'bg-phosphor-green'
                    }`}
                    style={{ width: `${diskPercent}%` }}
                  />
                </div>
              </div>

              {/* Retention Days */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="retention-days" className="text-xs font-medium text-silver-mist">
                    Retention Period (Days)
                  </label>
                  <span className="text-xs font-mono text-phosphor-green">
                    {storageSettings.retention_days} Days
                  </span>
                </div>
                <input
                  id="retention-days"
                  type="range"
                  min="1"
                  max="180"
                  step="1"
                  value={storageSettings.retention_days}
                  onChange={(e) =>
                    setStorageSettings({
                      ...storageSettings,
                      retention_days: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-phosphor-green cursor-pointer"
                />
                <p className="text-[11px] text-smoke mt-1 font-mono">
                  Transmissions older than this duration will be automatically purged by the retention engine.
                </p>
              </div>

              {/* Max Disk Quota */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="quota-percent" className="text-xs font-medium text-silver-mist">
                    Maximum Disk Quota (%)
                  </label>
                  <span className="text-xs font-mono text-phosphor-green">
                    {storageSettings.max_disk_usage_percent}%
                  </span>
                </div>
                <input
                  id="quota-percent"
                  type="range"
                  min="50"
                  max="95"
                  step="1"
                  value={storageSettings.max_disk_usage_percent}
                  onChange={(e) =>
                    setStorageSettings({
                      ...storageSettings,
                      max_disk_usage_percent: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-phosphor-green cursor-pointer"
                />
                <p className="text-[11px] text-smoke mt-1 font-mono">
                  When disk consumption exceeds this threshold, the oldest unstarred audio files are automatically pruned (FIFO).
                </p>
              </div>

              {/* Recording Audio Format */}
              <div>
                <label className="block text-xs font-medium text-silver-mist mb-1.5">
                  Audio Recording Format
                </label>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setStorageSettings({ ...storageSettings, audio_format: 'opus' })}
                    className={`py-2 px-3 rounded-inputs border transition-colors cursor-pointer text-left ${
                      storageSettings.audio_format === 'opus'
                        ? 'bg-ash text-phosphor-green border-phosphor-green/50'
                        : 'bg-obsidian text-silver-mist border-charcoal'
                    }`}
                  >
                    <div className="font-semibold">Opus (.opus)</div>
                    <div className="text-[10px] text-smoke">High efficiency voice compression (16kbps)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStorageSettings({ ...storageSettings, audio_format: 'wav' })}
                    className={`py-2 px-3 rounded-inputs border transition-colors cursor-pointer text-left ${
                      storageSettings.audio_format === 'wav'
                        ? 'bg-ash text-phosphor-green border-phosphor-green/50'
                        : 'bg-obsidian text-silver-mist border-charcoal'
                    }`}
                  >
                    <div className="font-semibold">WAV Lossless (.wav)</div>
                    <div className="text-[10px] text-smoke">Uncompressed 16-bit PCM</div>
                  </button>
                </div>
              </div>

              {/* Policy note */}
              <div className="p-3 bg-ash/50 border border-charcoal rounded-inputs text-xs text-smoke">
                <span className="text-phosphor-green font-medium">★ Starred Transmissions Policy:</span> Calls marked with a star are permanently protected and will never be removed by the auto-retention purge.
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-charcoal">
                {storageSaved && (
                  <span className="text-xs text-phosphor-green flex items-center gap-1.5 font-mono">
                    <Check className="w-3.5 h-3.5" />
                    <span>Storage settings saved.</span>
                  </span>
                )}
                {!storageSaved && <span />}

                <button
                  type="submit"
                  disabled={storageSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors text-xs cursor-pointer ml-auto"
                >
                  <Save className="w-4 h-4" />
                  <span>{storageSaving ? 'Saving...' : 'Save Storage'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: PASSWORD */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md mx-auto">
              <div>
                <label htmlFor="current-password" className="block text-xs font-medium text-silver-mist mb-1">
                  Current Password
                </label>
                <input
                  id="current-password"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-xs text-snow outline-none"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-silver-mist mb-1">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-xs text-snow outline-none"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-silver-mist mb-1">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-ash border border-slate focus:border-phosphor-green rounded-inputs px-3 py-2 text-xs text-snow outline-none"
                />
              </div>

              {passwordStatus.type === 'error' && (
                <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-inputs text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{passwordStatus.message}</span>
                </div>
              )}

              {passwordStatus.type === 'success' && (
                <div className="flex items-center gap-2 p-2.5 bg-phosphor-green/10 border border-phosphor-green/30 rounded-inputs text-xs text-phosphor-green">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{passwordStatus.message}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordStatus.type === 'loading'}
                  className="px-4 py-2 bg-phosphor-green text-obsidian font-medium rounded-pill hover:bg-mint-pulse transition-colors text-xs cursor-pointer"
                >
                  {passwordStatus.type === 'loading' ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
