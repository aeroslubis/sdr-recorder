import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '../components/TopBar';

describe('TopBar', () => {
  test('displays professional SDR RECORDER brand and clean hardware status', () => {
    render(
      <TopBar
        frequencyHz={118200000}
        modulation="AM"
        diskUsedGB={14.8}
        diskTotalGB={100}
        username="admin"
        onOpenSettings={jest.fn()}
        onLogout={jest.fn()}
      />
    );

    // Rebranded name
    expect(screen.getByText(/\[●\] SDR RECORDER/i)).toBeInTheDocument();
    // Does not have NVR
    expect(screen.queryByText(/SDR-NVR/i)).not.toBeInTheDocument();

    // Hardware status has text without duplicate bullet icon
    const hwText = screen.getByText('RTL-SDR ONLINE');
    expect(hwText).toBeInTheDocument();
  });

  test('clicking admin menu options triggers onOpenSettings with correct tabs', () => {
    const handleOpenSettings = jest.fn();
    const handleLogout = jest.fn();

    render(
      <TopBar
        frequencyHz={118200000}
        modulation="AM"
        diskUsedGB={14.8}
        diskTotalGB={100}
        username="admin"
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
      />
    );

    const adminButton = screen.getByRole('button', { name: /admin/i });
    expect(adminButton.textContent).toBe('');
    fireEvent.click(adminButton);

    // Verify only Settings and Sign Out appear in menu
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
    expect(screen.queryByText(/Channel Setup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Storage & Retention Manager/i)).not.toBeInTheDocument();

    // Click Settings
    fireEvent.click(screen.getByText('Settings'));
    expect(handleOpenSettings).toHaveBeenCalledWith('dongle');

    // Open menu again & click Sign Out
    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Sign Out/i));
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });

  test('renders theme toggle button with sun/moon icon and handles click', () => {
    const handleToggleTheme = jest.fn();

    const { rerender } = render(
      <TopBar
        theme="dark"
        onToggleTheme={handleToggleTheme}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /switch to light mode/i });
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton.querySelector('svg')).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(handleToggleTheme).toHaveBeenCalledTimes(1);

    // Re-render in light mode
    rerender(
      <TopBar
        theme="light"
        onToggleTheme={handleToggleTheme}
      />
    );

    const lightToggleButton = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(lightToggleButton).toBeInTheDocument();
    expect(lightToggleButton.querySelector('svg')).toBeInTheDocument();
  });
});
