import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  UiSettingsProvider,
  useUiSettings,
  UI_SETTINGS_STORAGE_KEY,
  DEFAULT_UI_SETTINGS,
} from '../context/UiSettingsContext';

const TestConsumer: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useUiSettings();

  return (
    <div>
      <span data-testid="color-map">{settings.spectrumColorMap}</span>
      <span data-testid="fps">{settings.spectrumFps}</span>
      <span data-testid="time-format">{settings.timeFormat}</span>
      <button
        onClick={() => updateSettings({ spectrumColorMap: 'cyan', spectrumFps: 60, timeFormat: '12h' })}
        data-testid="update-btn"
      >
        Update
      </button>
      <button onClick={() => resetSettings()} data-testid="reset-btn">
        Reset
      </button>
    </div>
  );
};

describe('UiSettingsContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('provides default UI settings on initial load', () => {
    render(
      <UiSettingsProvider>
        <TestConsumer />
      </UiSettingsProvider>
    );

    expect(screen.getByTestId('color-map').textContent).toBe(DEFAULT_UI_SETTINGS.spectrumColorMap);
    expect(screen.getByTestId('fps').textContent).toBe(String(DEFAULT_UI_SETTINGS.spectrumFps));
    expect(screen.getByTestId('time-format').textContent).toBe(DEFAULT_UI_SETTINGS.timeFormat);
  });

  test('updates settings and persists to localStorage', () => {
    render(
      <UiSettingsProvider>
        <TestConsumer />
      </UiSettingsProvider>
    );

    fireEvent.click(screen.getByTestId('update-btn'));

    expect(screen.getByTestId('color-map').textContent).toBe('cyan');
    expect(screen.getByTestId('fps').textContent).toBe('60');
    expect(screen.getByTestId('time-format').textContent).toBe('12h');

    const stored = JSON.parse(localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
    expect(stored.spectrumColorMap).toBe('cyan');
    expect(stored.spectrumFps).toBe(60);
    expect(stored.timeFormat).toBe('12h');
  });

  test('resets settings to defaults when resetSettings is called', () => {
    render(
      <UiSettingsProvider>
        <TestConsumer />
      </UiSettingsProvider>
    );

    fireEvent.click(screen.getByTestId('update-btn'));
    expect(screen.getByTestId('color-map').textContent).toBe('cyan');

    fireEvent.click(screen.getByTestId('reset-btn'));
    expect(screen.getByTestId('color-map').textContent).toBe('phosphor');
    expect(screen.getByTestId('fps').textContent).toBe('30');
  });
});
