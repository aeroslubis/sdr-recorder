import React, { createContext, useContext, useState, useEffect } from 'react';

export type SpectrumColorMap = 'phosphor' | 'cyan' | 'amber' | 'monochrome';
export type SpectrumFps = 60 | 30 | 15;
export type SpectrumDecay = 'fast' | 'normal' | 'slow' | 'off';
export type TimeFormat = '24h' | '12h';
export type TimelineDensity = 'standard' | 'compact';

export interface UiSettings {
  // Live Spectrum settings
  spectrumColorMap: SpectrumColorMap;
  spectrumFps: SpectrumFps;
  spectrumDecay: SpectrumDecay;
  spectrumPassband: boolean;
  spectrumFreezeOnHop: boolean;

  // General Interface & Audio
  timeFormat: TimeFormat;
  showSeconds: boolean;
  timelineDensity: TimelineDensity;
  defaultVolume: number; // 0.0 to 1.0
  continuousPlayback: boolean;
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  spectrumColorMap: 'phosphor',
  spectrumFps: 30,
  spectrumDecay: 'normal',
  spectrumPassband: true,
  spectrumFreezeOnHop: true,

  timeFormat: '24h',
  showSeconds: true,
  timelineDensity: 'standard',
  defaultVolume: 0.8,
  continuousPlayback: false,
};

export const UI_SETTINGS_STORAGE_KEY = 'sdr_ui_settings_v1';

export interface UiSettingsContextType {
  settings: UiSettings;
  updateSettings: (newSettings: Partial<UiSettings>) => void;
  resetSettings: () => void;
}

const UiSettingsContext = createContext<UiSettingsContextType | undefined>(undefined);

export const UiSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<UiSettings>(() => {
    try {
      const stored = localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_UI_SETTINGS, ...parsed };
      }
    } catch {}
    return DEFAULT_UI_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const updateSettings = (newSettings: Partial<UiSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_UI_SETTINGS);
  };

  return (
    <UiSettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </UiSettingsContext.Provider>
  );
};

export const useUiSettings = (): UiSettingsContextType => {
  const context = useContext(UiSettingsContext);
  if (!context) {
    return {
      settings: DEFAULT_UI_SETTINGS,
      updateSettings: () => {},
      resetSettings: () => {},
    };
  }
  return context;
};
