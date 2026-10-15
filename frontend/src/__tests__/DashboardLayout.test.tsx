import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { DashboardLayout } from '../components/DashboardLayout';

// Mock useAuth
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin' },
    token: 'fake-jwt',
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock WebAudioPlayer
vi.mock('../audio/WebAudioPlayer', () => {
  return {
    WebAudioPlayer: vi.fn().mockImplementation(() => ({
      onStateChange: vi.fn(),
      onTimeUpdate: vi.fn(),
      onEnded: vi.fn(),
      playUrl: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      stop: vi.fn(),
      resumeContext: vi.fn().mockResolvedValue(undefined),
      setVolume: vi.fn(),
      setPlaybackRate: vi.fn(),
      setDspFilter: vi.fn(),
      getAnalyser: vi.fn().mockReturnValue(null),
    })),
  };
});

// DashboardLayout test suite

describe('DashboardLayout Mobile View & Navigation', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/radio/status')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              frequency_hz: 118200000,
              modulation: 'AM',
              squelch_threshold: -42,
              rf_gain: 38.6,
              ppm_offset: 0,
              hardware_connected: true,
            }),
        });
      }
      if (url.includes('/api/radio/presets')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, name: 'Tower', frequency_hz: 118200000, modulation: 'AM', squelch_threshold: -42 },
            ]),
        });
      }
      if (url.includes('/api/recordings/active-dates')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['2026-10-15']),
        });
      }
      if (url.includes('/api/recordings/timeline')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (url.includes('/api/recordings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (url.includes('/api/system/stats')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              hardware_connected: true,
              storage: { used_gb: 15.0, total_gb: 100.0 },
            }),
        });
      }
      if (url.includes('/api/system/time')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              server_time_formatted: '2026-10-15 14:00:00',
              tz_abbreviation: 'WIB',
              server_time_iso: '2026-10-15T14:00:00',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders mobile navigation bar and toggles tabs correctly', async () => {
    render(<DashboardLayout />);

    // Verify Mobile Navigation Bar is present
    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(mobileNav).toBeInTheDocument();

    const timelineTab = screen.getByRole('button', { name: /timeline tab/i });
    const historyTab = screen.getByRole('button', { name: /history tab/i });
    const radioTab = screen.getByRole('button', { name: /radio tab/i });

    expect(timelineTab).toBeInTheDocument();
    expect(historyTab).toBeInTheDocument();
    expect(radioTab).toBeInTheDocument();

    // Default tab is Timeline: Timeline canvas is rendered
    expect(screen.getByTestId('timeline-canvas')).toBeInTheDocument();

    // Switch to History Tab
    fireEvent.click(historyTab);
    expect(historyTab.className).toContain('text-phosphor-green');

    // Switch to Radio Tab
    fireEvent.click(radioTab);
    expect(radioTab.className).toContain('text-phosphor-green');
    expect(screen.getByText(/tuned frequency/i)).toBeInTheDocument();
  });
});
