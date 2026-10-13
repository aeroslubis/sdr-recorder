import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '../components/TopBar';

describe('TopBar', () => {
  test('displays professional SDR RECORDER brand and clean hardware status', () => {
    render(
      <TopBar
        frequencyHz={118200000}
        modulation="AM"
        isSimulator={false}
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
        isSimulator={false}
        diskUsedGB={14.8}
        diskTotalGB={100}
        username="admin"
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
      />
    );

    const adminButton = screen.getByRole('button', { name: /admin/i });
    fireEvent.click(adminButton);

    // Click SDR Dongle Configuration
    fireEvent.click(screen.getByText(/SDR Dongle Configuration/i));
    expect(handleOpenSettings).toHaveBeenCalledWith('dongle');

    // Open menu again & click Channel Setup
    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Channel Setup/i));
    expect(handleOpenSettings).toHaveBeenCalledWith('channels');

    // Open menu again & click Storage & Retention
    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Storage & Retention Manager/i));
    expect(handleOpenSettings).toHaveBeenCalledWith('storage');

    // Open menu again & click Change Password
    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Change Password/i));
    expect(handleOpenSettings).toHaveBeenCalledWith('password');

    // Open menu again & click Sign Out
    fireEvent.click(adminButton);
    fireEvent.click(screen.getByText(/Sign Out/i));
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });
});
